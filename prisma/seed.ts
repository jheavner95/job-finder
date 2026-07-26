import { PrismaClient, JobStatus } from "@prisma/client";
import { SYNTHETIC_JOBS } from "../lib/sample-opportunities";
import { createJobFingerprint } from "../lib/fingerprint";
import { scoreJob } from "../lib/scoring";

const prisma = new PrismaClient();

const statusMap = {
  New: JobStatus.NEW,
  "Strong Match": JobStatus.STRONG_MATCH,
  Possible: JobStatus.POSSIBLE,
  Rejected: JobStatus.REJECTED,
  Saved: JobStatus.SAVED,
  Applied: JobStatus.APPLIED,
  Interviewing: JobStatus.INTERVIEWING,
  Offer: JobStatus.OFFER,
  Closed: JobStatus.CLOSED,
} as const;

async function main() {
  for (const fixture of SYNTHETIC_JOBS) {
    const source = await prisma.jobSource.upsert({
      where: { name: fixture.source },
      update: {},
      create: { name: fixture.source, approved: false },
    });
    const company = await prisma.company.upsert({
      where: { name: fixture.company },
      update: { notes: fixture.companyNotes },
      create: { name: fixture.company, notes: fixture.companyNotes },
    });
    const fingerprint = createJobFingerprint({
      company: fixture.company,
      title: fixture.title,
      location: fixture.location,
      sourceJobId: fixture.id,
    });
    const result = scoreJob(fixture.evaluationInputs);
    const job = await prisma.job.upsert({
      where: { fingerprint },
      update: {
        title: fixture.title,
        location: fixture.location,
        remoteStatus: fixture.remoteStatus,
        employmentType: fixture.employmentType,
        compensationText: fixture.compensation,
        sourceUrl: fixture.sourceUrl,
        originalSourceText: fixture.description,
        normalizedDescription: fixture.description,
        normalizedRequirements: fixture.requirements,
        normalizedConcerns: fixture.concerns,
        status: statusMap[fixture.status],
        isSynthetic: true,
        companyId: company.id,
        sourceId: source.id,
      },
      create: {
        fingerprint,
        sourceJobId: fixture.id,
        title: fixture.title,
        location: fixture.location,
        remoteStatus: fixture.remoteStatus,
        employmentType: fixture.employmentType,
        compensationText: fixture.compensation,
        sourceUrl: fixture.sourceUrl,
        originalSourceText: fixture.description,
        normalizedDescription: fixture.description,
        normalizedRequirements: fixture.requirements,
        normalizedConcerns: fixture.concerns,
        status: statusMap[fixture.status],
        isSynthetic: true,
        companyId: company.id,
        sourceId: source.id,
        activity: {
          create: {
            type: "fixture_created",
            summary: "Synthetic fixture added for product development.",
          },
        },
      },
    });
    const existingEvaluation = await prisma.jobEvaluation.findFirst({
      where: { jobId: job.id, scoringVersion: "deterministic-v1" },
    });
    const evidence = fixture.evaluationInputs
      .filter((input) => input.evidence)
      .map((input) => ({
        contextFile: "context/career-profile.md",
        label: "Supplied candidate context",
        excerpt: input.evidence!,
        relevance: input.reason,
      }));
    if (existingEvaluation) {
      await prisma.jobEvaluation.update({
        where: { id: existingEvaluation.id },
        data: {
          score: result.score,
          reasoning: {
            summary: result.summary,
            confidence: result.confidence,
            eligibility: result.eligibility,
          },
          categoryResults: result.categories,
          evidence: {
            deleteMany: {},
            create: evidence,
          },
        },
      });
    } else {
      await prisma.jobEvaluation.create({
        data: {
          jobId: job.id,
          score: result.score,
          reasoning: {
            summary: result.summary,
            confidence: result.confidence,
            eligibility: result.eligibility,
          },
          categoryResults: result.categories,
          scoringVersion: "deterministic-v1",
          evidence: { create: evidence },
        },
      });
    }
  }
}

main()
  .finally(async () => prisma.$disconnect());
