import type { Prisma, PrismaClient } from "@prisma/client";

import { parseCandidateFacts } from "./candidate-facts";
import { detectPostingConstraints } from "./posting-constraints";
import { assessEligibility } from "./verdict";
import type {
  CandidateEligibilityFacts,
  EligibilityAssessment,
  EligibilityVerdict,
  PostingConstraint,
} from "./types";

/**
 * Prisma-facing layer. Detection and verdict logic stay pure and are tested
 * without a database; this file only loads, assesses and stores.
 */

type Transactional = Pick<PrismaClient, "jobEligibilityAssessment">;

export const CANDIDATE_PROFILE_ID = "primary-candidate";

export async function loadCandidateFacts(
  prisma: Pick<PrismaClient, "candidateProfile">,
): Promise<CandidateEligibilityFacts | null> {
  const profile = await prisma.candidateProfile.findFirst({
    select: { eligibilityFacts: true },
  });
  return parseCandidateFacts(profile?.eligibilityFacts ?? null);
}

export type AssessableJob = {
  id: string;
  title: string;
  normalizedDescription: string | null;
  originalSourceText: string;
  normalizedRequirements: Prisma.JsonValue;
};

function requirementList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function assessJob(
  job: AssessableJob,
  facts: CandidateEligibilityFacts | null,
): EligibilityAssessment {
  const constraints = detectPostingConstraints({
    title: job.title,
    // The normalized description is preferred; the raw source is the fallback
    // for postings imported before normalization existed.
    description: job.normalizedDescription ?? job.originalSourceText,
    requirements: requirementList(job.normalizedRequirements),
  });
  return assessEligibility(constraints, facts);
}

export async function persistAssessment(
  client: Transactional,
  jobId: string,
  assessment: EligibilityAssessment,
) {
  const data = {
    verdict: assessment.verdict,
    headline: assessment.headline,
    constraints: assessment.constraints as unknown as Prisma.InputJsonValue,
    detectorVersion: assessment.detectorVersion,
    candidateFactsUpdatedAt: assessment.candidateFactsUpdatedAt
      ? new Date(assessment.candidateFactsUpdatedAt)
      : null,
    assessedAt: new Date(),
  };
  await client.jobEligibilityAssessment.upsert({
    where: { jobId },
    create: { jobId, ...data },
    update: data,
  });
}

/**
 * Re-derive every job's verdict.
 *
 * Run after the candidate changes their declaration, or after the detector
 * version changes. Reads and writes only `JobEligibilityAssessment` — it never
 * touches jobs, evaluations, scores, connectors, or discovery state.
 */
export async function reassessAllJobs(
  prisma: PrismaClient,
  options: { batchSize?: number } = {},
): Promise<Record<EligibilityVerdict, number> & { total: number }> {
  const batchSize = options.batchSize ?? 100;
  const facts = await loadCandidateFacts(prisma);
  const counts = {
    total: 0,
    NO_CONSTRAINT_FOUND: 0,
    ELIGIBLE: 0,
    REVIEW_REQUIRED: 0,
    INELIGIBLE: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const jobs = await prisma.job.findMany({
      where: { isSynthetic: false },
      select: {
        id: true,
        title: true,
        normalizedDescription: true,
        originalSourceText: true,
        normalizedRequirements: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!jobs.length) break;

    for (const job of jobs) {
      const assessment = assessJob(job, facts);
      await persistAssessment(prisma, job.id, assessment);
      counts[assessment.verdict] += 1;
      counts.total += 1;
    }
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < batchSize) break;
  }

  return counts;
}

/** Shape stored in `JobEligibilityAssessment.constraints`. */
export function parseStoredConstraints(value: Prisma.JsonValue): PostingConstraint[] {
  return Array.isArray(value) ? (value as unknown as PostingConstraint[]) : [];
}
