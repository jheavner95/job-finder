import type { PrismaClient } from "@prisma/client";

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
  if (sourceJobIds.length) {
    await database.job.updateMany({
      where: { ...scope, sourceJobId: { in: sourceJobIds } },
      data: {
        lastSeenAt: input.observedAt,
        closedAt: null,
        reconciliationReason: null,
      },
    });
  }
  const missing = await database.job.findMany({
    where: {
      ...scope,
      ...(sourceJobIds.length ? { sourceJobId: { notIn: sourceJobIds } } : {}),
      closedAt: null,
    },
    select: { id: true, sourceJobId: true },
  });
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
