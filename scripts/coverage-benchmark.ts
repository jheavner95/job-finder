/**
 * Coverage benchmark.
 *
 * Measures Job Finder against an externally curated set of real, currently-open
 * product-design roles (dev/benchmark/product-design-openings.json). Internal
 * provider telemetry cannot tell us whether the product found the jobs that
 * actually exist; this can.
 *
 *   npm run coverage:benchmark            measure and print
 *   npm run coverage:benchmark -- --json  also write a machine-readable report
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { prisma } from "../lib/db";
import { canonicalEmployerKey } from "../lib/job-sources/employer-identity";
import { jobSourceRegistry } from "../lib/job-sources/registry";

type BenchmarkItem = {
  company: string;
  provider: string;
  boardToken: string;
  title: string;
  location: string;
  url: string;
};

type BenchmarkDocument = {
  capturedAt: string;
  description: string;
  employerCount: number;
  itemCount: number;
  items: BenchmarkItem[];
};

const MISS_REASONS = [
  "UNKNOWN_EMPLOYER",
  "UNKNOWN_BOARD",
  "UNSUPPORTED_ATS",
  "BOARD_NEVER_SCANNED",
  "PROVIDER_FAILURE",
  "FILTERED_TOO_EARLY",
  "NORMALIZATION_FAILED",
  "PERSISTENCE_FAILED",
  "INVALID",
  "UNEXPLAINED",
] as const;

type MissReason = (typeof MISS_REASONS)[number];

const BENCHMARK_PATH = resolve(process.cwd(), "dev/benchmark/product-design-openings.json");

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function percent(part: number, whole: number) {
  return whole === 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;
}

function pad(value: string | number, width: number) {
  return String(value).padEnd(width);
}

function padStart(value: string | number, width: number) {
  return String(value).padStart(width);
}

async function main() {
  const document = JSON.parse(readFileSync(BENCHMARK_PATH, "utf8")) as BenchmarkDocument;
  const registered = new Set(jobSourceRegistry.list().map((provider) => provider.id));

  const [connectors, jobs, crawls] = await Promise.all([
    prisma.companyConnector.findMany({
      select: {
        id: true,
        company: true,
        atsType: true,
        connectorKey: true,
        enabled: true,
        health: true,
        lastSuccessfulFetch: true,
      },
    }),
    prisma.job.findMany({
      where: { isSynthetic: false },
      select: {
        id: true,
        title: true,
        closedAt: true,
        company: { select: { name: true } },
        evaluations: {
          orderBy: { evaluatedAt: "desc" },
          take: 1,
          select: { score: true, reasoning: true },
        },
      },
    }),
    prisma.connectorCrawl.findMany({
      orderBy: { startedAt: "desc" },
      select: { connectorId: true, status: true, startedAt: true, metadata: true },
    }),
  ]);

  // Employer identity is compared canonically: one organisation can be stored
  // under more than one name (see lib/job-sources/employer-identity.ts). Titles
  // are still compared literally.
  const connectorsByCompany = new Map(connectors.map((c) => [canonicalEmployerKey(c.company), c]));
  const connectorsByBoard = new Map(connectors.map((c) => [`${c.atsType}:${normalize(c.connectorKey)}`, c]));
  const jobKeys = new Set(jobs.map((job) =>
    `${canonicalEmployerKey(job.company.name)}::${normalize(job.title)}`));

  // Latest crawl per connector, plus every disposition we ever recorded for it.
  const latestCrawl = new Map<string, (typeof crawls)[number]>();
  const dispositionsByConnector = new Map<string, Map<string, string>>();
  for (const crawl of crawls) {
    if (!latestCrawl.has(crawl.connectorId)) latestCrawl.set(crawl.connectorId, crawl);
    const metadata = crawl.metadata as
      | { dispositions?: Array<{ title?: string; disposition?: string }> }
      | null;
    if (!metadata?.dispositions) continue;
    const ledger = dispositionsByConnector.get(crawl.connectorId) ?? new Map<string, string>();
    for (const entry of metadata.dispositions) {
      if (!entry.title || !entry.disposition) continue;
      const key = normalize(entry.title);
      if (!ledger.has(key)) ledger.set(key, entry.disposition);
    }
    dispositionsByConnector.set(crawl.connectorId, ledger);
  }

  const misses: Array<BenchmarkItem & { reason: MissReason; detail: string }> = [];
  let discovered = 0;

  for (const item of document.items) {
    if (jobKeys.has(`${canonicalEmployerKey(item.company)}::${normalize(item.title)}`)) {
      discovered += 1;
      continue;
    }

    const byBoard = connectorsByBoard.get(`${item.provider}:${normalize(item.boardToken)}`);
    const byCompany = connectorsByCompany.get(canonicalEmployerKey(item.company));
    const connector = byBoard ?? byCompany;

    let reason: MissReason = "UNEXPLAINED";
    let detail = "";

    if (!registered.has(item.provider)) {
      reason = "UNSUPPORTED_ATS";
      detail = `No adapter registered for ${item.provider}.`;
    } else if (!connector) {
      reason = "UNKNOWN_EMPLOYER";
      detail = `No board registered for ${item.company}.`;
    } else if (!byBoard) {
      reason = "UNKNOWN_BOARD";
      detail = `${item.company} is registered on ${connector.atsType}/${connector.connectorKey}, not ${item.provider}/${item.boardToken}.`;
    } else {
      const ledger = dispositionsByConnector.get(connector.id);
      const disposition = ledger?.get(normalize(item.title));
      const crawl = latestCrawl.get(connector.id);
      if (disposition === "EXCLUDED") {
        reason = "FILTERED_TOO_EARLY";
        detail = "Retrieved by the provider, then dropped by pre-import screening.";
      } else if (disposition === "NORMALIZATION_FAILED" || disposition === "PERSISTENCE_FAILED" || disposition === "INVALID") {
        reason = disposition;
        detail = `Recorded in the disposition ledger as ${disposition}.`;
      } else if (!crawl) {
        reason = "BOARD_NEVER_SCANNED";
        detail = "Board is registered but has never been crawled.";
      } else if (["Blocked", "Failed", "CompletedWithErrors"].includes(crawl.status)) {
        reason = "PROVIDER_FAILURE";
        detail = `Most recent crawl finished as ${crawl.status}.`;
      } else {
        reason = "UNEXPLAINED";
        detail = `Board scanned cleanly on ${crawl.startedAt.toISOString().slice(0, 10)} but the posting never landed.`;
      }
    }

    misses.push({ ...item, reason, detail });
  }

  // ---- coverage side of the ledger -------------------------------------
  const activeBoards = connectors.filter((c) => c.enabled && c.lastSuccessfulFetch);
  const scored = jobs
    .map((job) => job.evaluations[0]?.score)
    .filter((score): score is number => typeof score === "number");
  const tierCounts = new Map<string, number>();
  for (const job of jobs) {
    const reasoning = job.evaluations[0]?.reasoning as { tier?: string } | null;
    const tier = reasoning?.tier ?? "Untiered";
    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
  }

  const providersContributing = new Set<string>();
  for (const connector of connectors) {
    const ledger = dispositionsByConnector.get(connector.id);
    if (!ledger) continue;
    if ([...ledger.values()].some((value) => value === "IMPORTED" || value === "DUPLICATE")) {
      providersContributing.add(connector.atsType);
    }
  }

  const missCounts = new Map<MissReason, number>();
  for (const miss of misses) missCounts.set(miss.reason, (missCounts.get(miss.reason) ?? 0) + 1);

  const total = document.items.length;
  console.log("");
  console.log("COVERAGE BENCHMARK");
  console.log(`benchmark captured ${document.capturedAt} · ${total} real open roles across ${document.employerCount} employers`);
  console.log("=".repeat(74));
  console.log("");
  console.log("MARKET COVERAGE");
  console.log(`  employers known ................. ${connectors.length}`);
  console.log(`  boards enabled .................. ${connectors.filter((c) => c.enabled).length}`);
  console.log(`  boards fetched successfully ..... ${activeBoards.length}`);
  console.log(`  providers contributing jobs ..... ${providersContributing.size} of ${registered.size} registered`);
  console.log(`  jobs in database ................ ${jobs.length}`);
  console.log(`  jobs open (not closed) .......... ${jobs.filter((j) => !j.closedAt).length}`);
  console.log("");
  console.log("OPPORTUNITY YIELD");
  for (const [tier, count] of [...tierCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pad(tier, 30, )} ${padStart(count, 5)}`);
  }
  console.log(`  ${pad("scored jobs", 30)} ${padStart(scored.length, 5)}`);
  console.log(`  ${pad("score >= 80", 30)} ${padStart(scored.filter((s) => s >= 80).length, 5)}`);
  console.log("");
  console.log("DISCOVERY RECALL");
  console.log(`  benchmark opportunities ......... ${total}`);
  console.log(`  discovered ...................... ${discovered}`);
  console.log(`  missed .......................... ${misses.length}`);
  console.log(`  RECALL .......................... ${percent(discovered, total)}`);
  console.log("");
  console.log("MISS REASONS");
  for (const reason of MISS_REASONS) {
    const count = missCounts.get(reason) ?? 0;
    if (!count) continue;
    console.log(`  ${pad(reason, 24)} ${padStart(count, 4)}  ${percent(count, total)}`);
  }
  console.log("");

  const filtered = misses.filter((m) => m.reason === "FILTERED_TOO_EARLY");
  if (filtered.length) {
    console.log("FALSE NEGATIVES (retrieved, then filtered out)");
    for (const miss of filtered) console.log(`  ${miss.company} — ${miss.title}`);
    console.log("");
  }

  if (process.argv.includes("--json")) {
    const report = {
      measuredAt: new Date().toISOString(),
      benchmark: { capturedAt: document.capturedAt, total, employers: document.employerCount },
      coverage: {
        employersKnown: connectors.length,
        boardsEnabled: connectors.filter((c) => c.enabled).length,
        boardsFetched: activeBoards.length,
        providersContributing: providersContributing.size,
        jobsInDatabase: jobs.length,
      },
      recall: { discovered, missed: misses.length, rate: discovered / total },
      tiers: Object.fromEntries(tierCounts),
      missReasons: Object.fromEntries(missCounts),
      misses,
    };
    const out = resolve(process.cwd(), "dev/benchmark/last-run.json");
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`report written to ${out}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
