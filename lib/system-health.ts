import type { PrismaClient } from "@prisma/client";

/**
 * Is discovery working?
 *
 * The old Discovery workspace answered this with a wall: twelve providers, 403
 * boards, jobs reachable, boards fetching, boards queued, boards needing
 * attention, coverage percentages, a provider table and a resolution ledger —
 * roughly 30,000 characters across nine sections. All of it true, none of it
 * an answer.
 *
 * A healthy engine should be quiet. This produces one verdict and the two or
 * three facts behind it; the detail pages stay available for when the verdict
 * is bad.
 */

export type SystemHealth = {
  /** The single verdict the overview leads with. */
  state: "healthy" | "attention" | "failing" | "never-run";
  headline: string;
  /** When discovery last completed, whatever the outcome. */
  lastScanAt: Date | null;
  lastScanStatus: string | null;
  /** Opportunities the most recent completed scan added. */
  lastScanImported: number;
  /** Whether anything is scheduled, and when. */
  nextRunAt: Date | null;
  /** Companies being monitored, and how many are not currently reachable. */
  companiesMonitored: number;
  companiesFailing: number;
  /** Sources whose most recent crawl failed outright. */
  failingProviders: { name: string; companies: number }[];
};

/** A company is "failing" only when the engine says so, not when it is merely quiet. */
const UNHEALTHY = ["Error", "Blocked", "Failed"];

export async function getSystemHealth(database: PrismaClient): Promise<SystemHealth> {
  const [connectors, lastBatch, nextSchedule] = await Promise.all([
    database.companyConnector.findMany({
      where: { enabled: true },
      select: { atsType: true, health: true },
    }),
    database.discoveryBatch.findFirst({
      where: { status: { not: "Running" } },
      orderBy: { startedAt: "desc" },
    }),
    database.connectorSchedule.findFirst({
      where: { nextRunAt: { not: null }, connector: { enabled: true } },
      orderBy: { nextRunAt: "asc" },
    }),
  ]);

  const failing = connectors.filter((connector) => UNHEALTHY.includes(connector.health));
  const byProvider = new Map<string, number>();
  for (const connector of failing) {
    byProvider.set(connector.atsType, (byProvider.get(connector.atsType) ?? 0) + 1);
  }
  const failingProviders = [...byProvider.entries()]
    .map(([name, companies]) => ({ name, companies }))
    .sort((left, right) => right.companies - left.companies);

  const share = connectors.length ? failing.length / connectors.length : 0;
  const state: SystemHealth["state"] = !lastBatch
    ? "never-run"
    // A fifth of the watchlist unreachable is a broken engine, not a bad day.
    : share >= 0.2
      ? "failing"
      : failing.length > 0
        ? "attention"
        : "healthy";

  return {
    state,
    headline: {
      healthy: "Everything is working",
      attention: `${failing.length} ${failing.length === 1 ? "company is" : "companies are"} not responding`,
      failing: `Discovery is degraded — ${failing.length} of ${connectors.length} companies are not responding`,
      "never-run": "Discovery has not run yet",
    }[state],
    lastScanAt: lastBatch?.completedAt ?? lastBatch?.startedAt ?? null,
    lastScanStatus: lastBatch?.status ?? null,
    lastScanImported: lastBatch?.jobsImported ?? 0,
    nextRunAt: nextSchedule?.nextRunAt ?? null,
    companiesMonitored: connectors.length,
    companiesFailing: failing.length,
    failingProviders,
  };
}

/** "4 hours ago". The only form the overview needs. */
export function ago(value: Date | null): string {
  if (!value) return "never";
  const hours = Math.floor((Date.now() - value.getTime()) / 3_600_000);
  if (hours < 1) return "in the last hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
