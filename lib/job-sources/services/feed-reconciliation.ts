import type { PrismaClient } from "@prisma/client";

/**
 * SQLite binds a limited number of parameters per statement, and a large board
 * feed can carry hundreds of identifiers. Positive `in` filters are chunked;
 * negation is handled in memory because Prisma cannot split a `notIn`.
 */
const PARAMETER_CHUNK = 400;

function chunked<T>(values: T[], size = PARAMETER_CHUNK) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function reconcileCompleteFeed(
  database: PrismaClient,
  input: {
    sourceName: string;
    companyName: string;
    sourceJobIds: string[];
    observedAt: Date;
  },
) {
  const sourceJobIds = [...new Set(input.sourceJobIds.filter(Boolean))];
  const scope = {
    source: { name: input.sourceName },
    company: { name: input.companyName },
    sourceJobId: { not: null },
  } as const;
  for (const chunk of chunked(sourceJobIds)) {
    await database.job.updateMany({
      where: { ...scope, sourceJobId: { in: chunk } },
      data: {
        lastSeenAt: input.observedAt,
        closedAt: null,
        reconciliationReason: null,
      },
    });
  }
  const observed = new Set(sourceJobIds);
  const open = await database.job.findMany({
    where: { ...scope, closedAt: null },
    select: { id: true, sourceJobId: true },
  });
  const missing = open.filter((job) => job.sourceJobId && !observed.has(job.sourceJobId));
  if (!missing.length) return { closed: 0, observed: sourceJobIds.length };
  await database.$transaction(missing.map((job) => database.job.update({
    where: { id: job.id },
    data: {
      closedAt: input.observedAt,
      reconciliationReason: "absent_from_successful_complete_feed",
      activity: {
        create: {
          type: "provider_reconciliation",
          summary: "Opportunity closed because it was absent from a successful complete provider feed.",
          metadata: {
            reason: "absent_from_successful_complete_feed",
            sourceJobId: job.sourceJobId,
            observedAt: input.observedAt.toISOString(),
          },
        },
      },
    },
  })));
  return { closed: missing.length, observed: sourceJobIds.length };
}

export async function reconcileExplicitDeletion(
  database: PrismaClient,
  input: {
    sourceName: string;
    companyName: string;
    sourceJobId: string;
    observedAt: Date;
  },
) {
  const job = await database.job.findFirst({
    where: {
      source: { name: input.sourceName },
      company: { name: input.companyName },
      sourceJobId: input.sourceJobId,
      closedAt: null,
    },
    select: { id: true },
  });
  if (!job) return false;
  await database.job.update({
    where: { id: job.id },
    data: {
      closedAt: input.observedAt,
      reconciliationReason: "explicit_provider_deletion",
      activity: {
        create: {
          type: "provider_reconciliation",
          summary: "Opportunity closed because the provider explicitly reported it deleted.",
          metadata: {
            reason: "explicit_provider_deletion",
            sourceJobId: input.sourceJobId,
            observedAt: input.observedAt.toISOString(),
          },
        },
      },
    },
  });
  return true;
}
