import { JobStatus, type PrismaClient } from "@prisma/client";

import type { JobImportPreview } from "./job-import";

export type ImportJobResult = {
  jobId: string;
  duplicate: boolean;
  score: number;
  confidence: number;
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

  return database.$transaction(async (transaction) => {
    const duplicate = await transaction.job.findUnique({
      where: { fingerprint: normalized.fingerprint },
      select: {
        id: true,
        title: true,
        location: true,
        compensationText: true,
        normalizedDescription: true,
        normalizedRequirements: true,
      },
    });

    let jobId: string;
    if (duplicate) {
      jobId = duplicate.id;
      const changes = [
        duplicate.title !== normalized.title && { field: "Title", before: duplicate.title, after: normalized.title },
        duplicate.location !== normalized.location && { field: "Location", before: duplicate.location, after: normalized.location },
        duplicate.compensationText !== normalized.salary && { field: "Salary", before: duplicate.compensationText, after: normalized.salary },
        duplicate.normalizedDescription !== normalized.description && { field: "Description", before: duplicate.normalizedDescription, after: normalized.description },
        JSON.stringify(duplicate.normalizedRequirements) !== JSON.stringify(normalized.requirements) && {
          field: "Requirements",
          before: duplicate.normalizedRequirements,
          after: normalized.requirements,
        },
      ].filter(Boolean);
      await transaction.job.update({
        where: { id: duplicate.id },
        data: {
          lastSeenAt: new Date(),
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
      const job = await transaction.job.create({
        data: {
          fingerprint: normalized.fingerprint,
          title: normalized.title,
          location: normalized.location,
          remoteStatus: normalized.remoteStatus,
          employmentType: normalized.employmentType,
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
          importMethod: "manual-deterministic",
        },
        categoryResults: evaluation.categories,
        scoringVersion: "deterministic-v1",
      },
    });
    await transaction.activityEvent.create({
      data: {
        jobId,
        type: "job_rescored",
        summary: `Deterministic evaluation completed with a score of ${evaluation.score}.`,
        metadata: { scoringVersion: "deterministic-v1", score: evaluation.score },
      },
    });

    return {
      jobId,
      duplicate: Boolean(duplicate),
      score: evaluation.score,
      confidence: evaluation.confidence,
    };
  });
}
