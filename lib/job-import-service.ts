import { JobStatus, type PrismaClient } from "@prisma/client";

import { assessJob, loadCandidateFacts, persistAssessment } from "./eligibility/service";
import {
  assessJobLevel,
  loadCandidateLevelProfile,
  persistLevelAssessment,
} from "./level-fit/service";
import type { JobImportPreview } from "./job-import";
import { type OpportunityTier, tierForScore } from "./opportunity-tiers";

export type ImportJobResult = {
  jobId: string;
  duplicate: boolean;
  score: number;
  confidence: number;
  tier: OpportunityTier;
};

export async function findDuplicateJob(
  database: PrismaClient,
  fingerprint: string,
) {
  return database.job.findUnique({
    where: { fingerprint },
    select: { id: true, title: true, company: { select: { name: true } } },
  });
}

export async function importJobPreview(
  database: PrismaClient,
  preview: JobImportPreview,
): Promise<ImportJobResult> {
  const { normalized, evaluation } = preview;
  // Recomputed on every import, including duplicates, so a re-import always
  // lands on the tier its current score deserves.
  const tier = tierForScore(evaluation.score);

  return database.$transaction(async (transaction) => {
    const source = await transaction.jobSource.upsert({
      where: { name: normalized.source },
      update: {},
      create: { name: normalized.source, approved: false },
    });
    const company = await transaction.company.upsert({
      where: { name: normalized.company },
      update: {},
      create: { name: normalized.company },
    });
    const duplicate = await transaction.job.findFirst({
      where: {
        OR: [
          { fingerprint: normalized.fingerprint },
          ...(normalized.sourceUrl ? [{ sourceUrl: normalized.sourceUrl }] : []),
          ...(normalized.providerExternalId ? [{
            sourceId: source.id,
            companyId: company.id,
            sourceJobId: normalized.providerExternalId,
          }] : []),
        ],
      },
      select: {
        id: true,
        sourceJobId: true,
        title: true,
        department: true,
        location: true,
        compensationText: true,
        normalizedDescription: true,
        normalizedRequirements: true,
        postedAt: true,
        sourceUpdatedAt: true,
        applicationUrl: true,
      },
    });

    let jobId: string;
    if (duplicate) {
      jobId = duplicate.id;
      const changes = [
        duplicate.title !== normalized.title && { field: "Title", before: duplicate.title, after: normalized.title },
        duplicate.department !== normalized.department && { field: "Department", before: duplicate.department, after: normalized.department },
        duplicate.location !== normalized.location && { field: "Location", before: duplicate.location, after: normalized.location },
        duplicate.compensationText !== normalized.salary && { field: "Salary", before: duplicate.compensationText, after: normalized.salary },
        duplicate.normalizedDescription !== normalized.description && { field: "Description", before: duplicate.normalizedDescription, after: normalized.description },
        JSON.stringify(duplicate.normalizedRequirements) !== JSON.stringify(normalized.requirements) && {
          field: "Requirements",
          before: duplicate.normalizedRequirements,
          after: normalized.requirements,
        },
        duplicate.postedAt?.getTime() !== normalized.postedAt?.getTime() && {
          field: "Opened date", before: duplicate.postedAt, after: normalized.postedAt,
        },
        duplicate.sourceUpdatedAt?.getTime() !== normalized.sourceUpdatedAt?.getTime() && {
          field: "Provider updated date", before: duplicate.sourceUpdatedAt, after: normalized.sourceUpdatedAt,
        },
        duplicate.applicationUrl !== normalized.applicationUrl && {
          field: "Application URL", before: duplicate.applicationUrl, after: normalized.applicationUrl,
        },
      ].filter(Boolean);
      await transaction.job.update({
        where: { id: duplicate.id },
        data: {
          lastSeenAt: new Date(),
          sourceJobId: duplicate.sourceJobId ?? normalized.providerExternalId,
          department: normalized.department,
          postedAt: normalized.postedAt,
          sourceUpdatedAt: normalized.sourceUpdatedAt,
          applicationUrl: normalized.applicationUrl,
          activity: {
            create: [
              {
                type: "duplicate_import",
                summary:
                  "A repeat import matched this opportunity; no duplicate record was created.",
                metadata: {
                  importedAt: new Date().toISOString(),
                  sourceUrl: normalized.sourceUrl,
                },
              },
              ...(changes.length ? [{
                type: "posting_change_detected",
                summary: `${changes.length} posting change${changes.length === 1 ? "" : "s"} detected.`,
                metadata: { changes },
              }] : []),
            ],
          },
        },
      });
    } else {
      const job = await transaction.job.create({
        data: {
          sourceJobId: normalized.providerExternalId,
          fingerprint: normalized.fingerprint,
          title: normalized.title,
          department: normalized.department,
          location: normalized.location,
          remoteStatus: normalized.remoteStatus,
          employmentType: normalized.employmentType,
          postedAt: normalized.postedAt,
          sourceUpdatedAt: normalized.sourceUpdatedAt,
          applicationUrl: normalized.applicationUrl,
          compensationText: normalized.salary,
          sourceUrl: normalized.sourceUrl,
          originalSourceText: normalized.description,
          normalizedDescription: normalized.description,
          normalizedRequirements: normalized.requirements,
          normalizedConcerns: normalized.concerns,
          status: JobStatus.NEW,
          isSynthetic: false,
          companyId: company.id,
          sourceId: source.id,
          activity: {
            create: {
              type: "job_imported",
              summary: "Opportunity imported manually and queued for review.",
              metadata: {
                source: normalized.source,
                sourceUrl: normalized.sourceUrl,
              },
            },
          },
        },
        select: { id: true },
      });
      jobId = job.id;
    }

    await transaction.jobEvaluation.create({
      data: {
        jobId,
        score: evaluation.score,
        reasoning: {
          summary: evaluation.summary,
          confidence: evaluation.confidence,
          eligibility: evaluation.eligibility,
          tier,
          importMethod: "manual-deterministic",
        },
        categoryResults: evaluation.categories,
        scoringVersion: "deterministic-v1",
      },
    });
    // Eligibility is derived alongside the score but stored separately, so the
    // verdict can be refreshed when the candidate updates their declaration
    // without re-running or disturbing the evaluation above.
    await persistAssessment(
      transaction,
      jobId,
      assessJob(
        {
          id: jobId,
          title: normalized.title,
          normalizedDescription: normalized.description,
          originalSourceText: normalized.description,
          normalizedRequirements: normalized.requirements,
        },
        await loadCandidateFacts(transaction),
      ),
    );

    // Level fit is derived from the same posting but stored separately, so it
    // can be refreshed when the candidate revises their target roles.
    await persistLevelAssessment(
      transaction,
      jobId,
      assessJobLevel(
        {
          id: jobId,
          title: normalized.title,
          normalizedDescription: normalized.description,
          originalSourceText: normalized.description,
          normalizedRequirements: normalized.requirements,
        },
        await loadCandidateLevelProfile(transaction),
      ),
    );

    await transaction.activityEvent.create({
      data: {
        jobId,
        type: "job_rescored",
        summary: `Deterministic evaluation completed with a score of ${evaluation.score} (${tier}).`,
        metadata: { scoringVersion: "deterministic-v1", score: evaluation.score, tier },
      },
    });

    return {
      jobId,
      duplicate: Boolean(duplicate),
      score: evaluation.score,
      confidence: evaluation.confidence,
      tier,
    };
  });
}
