/**
 * Employer discovery.
 *
 * The layer the product was missing. Previously Job Finder could only scan
 * employers a human had already found and pasted in, which capped market
 * coverage at whatever the user happened to know. This discovers employers,
 * resolves each to its public ATS board, verifies the board, and registers it
 * so the existing provider runners can scan it.
 *
 *   harvestCandidates  employer names from compliant public sources -> EmployerCandidate
 *   resolveCandidates  EmployerCandidate -> verified board -> CompanyConnector
 *   revalidateBoards   refresh job counts and flag boards that went stale
 */
import type { PrismaClient } from "@prisma/client";

import {
  BOARD_PROBES,
  boardCandidates,
  boardFingerprint,
  normalizeCompanyName,
  scoreConfidence,
  type ResolvedBoard,
} from "../board-resolution";
import { EMPLOYER_NAME_SOURCES, harvestEmployerNames, type EmployerNameSource } from "../employer-sources";
import { detectCompanySource } from "../detection";
import { getOperationalCapability } from "../capabilities";
import { checkRobots } from "../robots";
import { EMPTY_JOB_SEARCH } from "../types";

export type HarvestSummary = {
  sources: Array<{ sourceId: string; label: string; collected: number; skipped: boolean; reason?: string }>;
  namesSeen: number;
  candidatesCreated: number;
  alreadyKnown: number;
};

export type ResolveSummary = {
  attempted: number;
  resolved: number;
  unresolved: number;
  probesUsed: number;
  boardsRegistered: number;
  collisions: number;
  jobsReachable: number;
  byProvider: Record<string, number>;
};

export type RevalidationSummary = {
  checked: number;
  healthy: number;
  stale: number;
  failed: number;
};

const PROBE_DELAY_MS = 120;
const MAX_ATTEMPTS = 3;

/** Discovery-source marker for employers the user explicitly asked us to watch. */
export const TARGET_SOURCE = "target";
/** Hard ceiling on one targeted resolution pass. */
export const MAX_TARGET_BATCH = 25;

export const TARGET_STATES = [
  "Targeted",
  "Resolving",
  "Resolved",
  "Unresolved",
  "Unavailable",
] as const;
export type TargetState = (typeof TARGET_STATES)[number];

/**
 * Maps persisted candidate status onto the user-facing state model.
 *
 * A retry-eligible candidate stays `Pending` in storage, but once it has been
 * attempted it must not read as "Targeted" — that would look like it was never
 * tried. Attempts distinguish the two.
 */
export function targetState(status: string, attempts = 0): TargetState {
  if (status === "Resolved") return "Resolved";
  if (status === "Resolving") return "Resolving";
  if (status === "Unresolved") return "Unresolved";
  if (status === "Unavailable") return "Unavailable";
  return attempts > 0 ? "Unresolved" : "Targeted";
}

function wait(milliseconds: number) {
  return milliseconds > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
    : Promise.resolve();
}

/** Robots is checked once per provider endpoint and cached for the run. */
class RobotsGate {
  private readonly cache = new Map<string, boolean>();

  constructor(private readonly client: typeof fetch) {}

  async allows(providerId: string, token: string, careerUrl: string) {
    const cached = this.cache.get(providerId);
    if (cached !== undefined) return cached;
    let allowed = false;
    try {
      const capability = getOperationalCapability(providerId);
      const target = capability.robotsTarget({ connectorKey: token, careerUrl });
      const decision = await checkRobots(
        target.url,
        target.path,
        this.client,
        capability.robotsUnavailablePolicy,
      );
      allowed = decision.allowed;
    } catch {
      // Fail closed: an unverifiable policy is not permission.
      allowed = false;
    }
    this.cache.set(providerId, allowed);
    return allowed;
  }
}

export async function harvestCandidates(
  database: PrismaClient,
  options: { client?: typeof fetch; sources?: EmployerNameSource[] } = {},
): Promise<HarvestSummary> {
  const results = await harvestEmployerNames(options.client ?? fetch, options.sources ?? EMPLOYER_NAME_SOURCES);

  const byNormalized = new Map<string, { name: string; source: string }>();
  for (const result of results) {
    for (const name of result.names) {
      const normalized = normalizeCompanyName(name);
      if (!normalized || normalized.length < 2) continue;
      if (!byNormalized.has(normalized)) byNormalized.set(normalized, { name, source: result.sourceId });
    }
  }

  const normalizedKeys = [...byNormalized.keys()];
  const existing = await database.employerCandidate.findMany({
    where: { normalizedName: { in: normalizedKeys } },
    select: { normalizedName: true },
  });
  const known = new Set(existing.map((row) => row.normalizedName));

  const fresh = normalizedKeys.filter((key) => !known.has(key));
  for (let index = 0; index < fresh.length; index += 200) {
    const slice = fresh.slice(index, index + 200);
    await database.employerCandidate.createMany({
      data: slice.map((normalizedName) => {
        const entry = byNormalized.get(normalizedName)!;
        return { name: entry.name, normalizedName, source: entry.source, status: "Pending" };
      }),
    });
  }

  return {
    sources: results.map((result) => ({
      sourceId: result.sourceId,
      label: result.label,
      collected: result.names.length,
      skipped: result.skipped,
      reason: result.reason,
    })),
    namesSeen: byNormalized.size,
    candidatesCreated: fresh.length,
    alreadyKnown: known.size,
  };
}

/**
 * Probes every provider for one candidate token. Each provider is a different
 * host, so these run concurrently — the per-host request rate stays at one
 * in-flight request, which is what the rate limits care about.
 */
async function probeBoard(
  client: typeof fetch,
  gate: RobotsGate,
  name: string,
  candidate: { token: string; exact: boolean },
): Promise<{ board: ResolvedBoard | null; probes: number }> {
  const allowed: typeof BOARD_PROBES = [];
  for (const probe of BOARD_PROBES) {
    if (await gate.allows(probe.providerId, candidate.token, probe.careerUrl(candidate.token))) {
      allowed.push(probe);
    }
  }

  const settled = await Promise.all(allowed.map(async (probe) => {
    const careerUrl = probe.careerUrl(candidate.token);
    try {
      const response = await client(probe.url(candidate.token), {
        headers: {
          "User-Agent": "job-search-intelligence/1.0",
          Accept: probe.responseType === "json" ? "application/json" : "text/xml, application/xml",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      const body = probe.responseType === "json"
        ? ((await response.json()) as unknown)
        : await response.text();
      const read = probe.read(body, candidate.token);
      if (!read || read.jobCount <= 0) return null;
      return {
        providerId: probe.providerId,
        boardToken: candidate.token,
        careerUrl,
        jobCount: read.jobCount,
        identity: read.identity,
        identityConfirmed: Boolean(read.identity),
        confidence: scoreConfidence({ name, candidate, jobCount: read.jobCount, identity: read.identity }),
        fingerprint: boardFingerprint(probe.providerId, candidate.token, read.identity),
      } satisfies ResolvedBoard;
    } catch {
      // A network or parse failure on one provider must not stop the others.
      return null;
    }
  }));

  await wait(PROBE_DELAY_MS);
  const hits = settled.filter((entry): entry is ResolvedBoard => entry !== null);
  hits.sort((a, b) => b.confidence - a.confidence || b.jobCount - a.jobCount);
  return { board: hits[0] ?? null, probes: allowed.length };
}

export async function resolveCandidates(
  database: PrismaClient,
  options: {
    limit?: number;
    client?: typeof fetch;
    minimumConfidence?: number;
    /** Resolve only these candidates. Prevents any backlog processing. */
    candidateIds?: string[];
  } = {},
): Promise<ResolveSummary> {
  const client = options.client ?? fetch;
  const minimumConfidence = options.minimumConfidence ?? 60;
  const gate = new RobotsGate(client);

  // Two selection modes, deliberately exclusive. `candidateIds` resolves EXACTLY
  // the rows named by the caller — used by Target Employers so that adding a
  // handful of companies can never start draining the pending backlog. Without
  // it, the normal oldest-first Pending sweep applies.
  const scoped = options.candidateIds?.length
    ? { id: { in: options.candidateIds } }
    : { status: "Pending", attempts: { lt: MAX_ATTEMPTS } };

  const pending = await database.employerCandidate.findMany({
    where: scoped,
    orderBy: { createdAt: "asc" },
    take: options.candidateIds?.length
      ? Math.min(options.candidateIds.length, options.limit ?? MAX_TARGET_BATCH)
      : options.limit ?? 250,
  });

  if (pending.length) {
    await database.employerCandidate.updateMany({
      where: { id: { in: pending.map((candidate) => candidate.id) } },
      data: { status: "Resolving" },
    });
  }

  const summary: ResolveSummary = {
    attempted: pending.length,
    resolved: 0,
    unresolved: 0,
    probesUsed: 0,
    boardsRegistered: 0,
    collisions: 0,
    jobsReachable: 0,
    byProvider: {},
  };

  // Probe a few employers at once — each provider is a separate host, so the
  // per-host concurrency stays low — but keep every database write sequential
  // so the connector uniqueness constraints cannot race.
  //
  // Held at 2, not 5. Each candidate fans out across every provider probe at
  // once, and some probe responses are large: Lever's postings endpoint returns
  // full descriptions (measured 3.29MB for 115 postings). At 5 candidates the
  // worst case was ~35 concurrent sockets carrying up to five multi-megabyte
  // description payloads simultaneously.
  const CHUNK = 2;
  const chunks: (typeof pending)[] = [];
  for (let index = 0; index < pending.length; index += CHUNK) {
    chunks.push(pending.slice(index, index + CHUNK));
  }

  for (const chunk of chunks) {
    const probed = await Promise.all(chunk.map(async (candidate) => {
      let resolved: ResolvedBoard | null = null;
      let probes = 0;
      for (const derived of boardCandidates(candidate.name)) {
        const attempt = await probeBoard(client, gate, candidate.name, derived);
        probes += attempt.probes;
        if (attempt.board && attempt.board.confidence >= minimumConfidence) {
          resolved = attempt.board;
          break;
        }
      }
      return { candidate, resolved, probes };
    }));

    for (const { candidate, resolved, probes } of probed) {
    summary.probesUsed += probes;

    if (!resolved) {
      summary.unresolved += 1;
      // Zero probes issued means every provider was withheld by its robots
      // policy, not that the employer has no board. Those are different
      // outcomes and the user should be able to tell them apart.
      const unavailable = probes === 0;
      await database.employerCandidate.update({
        where: { id: candidate.id },
        data: {
          attempts: { increment: 1 },
          probesUsed: { increment: probes },
          lastAttemptAt: new Date(),
          status: unavailable
            ? "Unavailable"
            : candidate.attempts + 1 >= MAX_ATTEMPTS ? "Unresolved" : "Pending",
          notes: unavailable
            ? "Every supported provider is withheld by its robots policy."
            : "No public ATS board matched this employer name.",
        },
      });
      continue;
    }

    const clash = await database.companyConnector.findFirst({
      where: {
        OR: [
          { company: candidate.name },
          { atsType: resolved.providerId, connectorKey: resolved.boardToken },
        ],
      },
      select: { id: true },
    });
    if (clash) {
      summary.collisions += 1;
      await database.employerCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "Resolved",
          attempts: { increment: 1 },
          probesUsed: { increment: probes },
          lastAttemptAt: new Date(),
          resolvedProvider: resolved.providerId,
          resolvedKey: resolved.boardToken,
          connectorId: clash.id,
          notes: "Board already registered.",
        },
      });
      continue;
    }

    const connector = await database.companyConnector.create({
      data: {
        company: candidate.name,
        careerUrl: resolved.careerUrl,
        atsType: resolved.providerId,
        connectorKey: resolved.boardToken,
        // Recall-first: no title or location gate at retrieval time. Relevance
        // screening and ranking decide what the user sees.
        searchCriteria: EMPTY_JOB_SEARCH,
        enabled: true,
        health: "Healthy",
        discoverySource: `auto:${candidate.source}`,
        discoveryConfidence: resolved.confidence,
        validationStatus: "Validated",
        jobsAvailable: resolved.jobCount,
        lastValidatedAt: new Date(),
        boardFingerprint: resolved.fingerprint,
      },
      select: { id: true },
    });

    summary.resolved += 1;
    summary.boardsRegistered += 1;
    summary.jobsReachable += resolved.jobCount;
    summary.byProvider[resolved.providerId] = (summary.byProvider[resolved.providerId] ?? 0) + 1;

    await database.employerCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "Resolved",
        attempts: { increment: 1 },
        probesUsed: { increment: probes },
        lastAttemptAt: new Date(),
        resolvedProvider: resolved.providerId,
        resolvedKey: resolved.boardToken,
        connectorId: connector.id,
        notes: `Resolved with ${resolved.confidence}% confidence.`,
      },
    });
    }
  }

  return summary;
}

/**
 * Background-queue priority by discovery source, from measured first-pass
 * resolution rates (DE-1): arbeitnow 27.3%, himalayas 26.7%, remotive 11.8%,
 * remoteok 1.2%.
 *
 * Ordering by `createdAt` alone was accidental — it tracked harvest insertion
 * order, which front-loaded the queue with the weakest source. Bands are coarse
 * on purpose: they encode the one thing the data supports (source quality) and
 * nothing it does not.
 */
/** Curated market intelligence — reviewed by a human, so it outranks harvested sources. */
export const SEED_SOURCE = "seed:ai";

const SOURCE_PRIORITY: Record<string, number> = {
  [SEED_SOURCE]: 0,
  arbeitnow: 1,
  himalayas: 1,
  remotive: 2,
  remoteok: 3,
};
const DEFAULT_SOURCE_BAND = 2;

export function sourcePriority(source: string) {
  return SOURCE_PRIORITY[source] ?? DEFAULT_SOURCE_BAND;
}

/**
 * Chooses the next background candidates: highest-yield source band first,
 * oldest-first within a band. Target employers are deliberately excluded — they
 * keep their own explicit scoped path and must never be starved by, or mixed
 * into, the background queue.
 */
export async function selectBackgroundQueue(database: PrismaClient, limit: number) {
  const pending = await database.employerCandidate.findMany({
    where: {
      status: "Pending",
      attempts: { lt: MAX_ATTEMPTS },
      source: { not: TARGET_SOURCE },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, source: true, attempts: true, createdAt: true },
  });
  return pending
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) =>
      sourcePriority(a.candidate.source) - sourcePriority(b.candidate.source)
      || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export type SeedRegistrationSummary = {
  considered: number;
  created: number;
  promoted: number;
  alreadySeeded: number;
  skippedResolved: number;
  skipped: Array<{ name: string; reason: string }>;
};

/**
 * Registers reviewed seed employers as candidates. Registration only — nothing
 * is resolved or scanned here.
 *
 * Provenance limitation, stated plainly: `EmployerCandidate.source` is a single
 * string, so an employer cannot carry two provenances at once. A candidate that
 * arrived from a market source and is later seeded is *promoted* to `seed:ai`,
 * and its original provenance is preserved in `notes` rather than discarded.
 * Candidates that already resolved are left completely alone — they are past
 * the point where provenance affects anything.
 */
export async function registerSeedEmployers(
  database: PrismaClient,
  employers: Array<{ canonicalName: string; officialDomain: string; confidenceBand: string }>,
): Promise<SeedRegistrationSummary> {
  const summary: SeedRegistrationSummary = {
    considered: employers.length,
    created: 0,
    promoted: 0,
    alreadySeeded: 0,
    skippedResolved: 0,
    skipped: [],
  };

  for (const employer of employers) {
    const normalized = normalizeCompanyName(employer.canonicalName);
    if (!normalized || normalized.length < 2) {
      summary.skipped.push({ name: employer.canonicalName, reason: "name did not normalise" });
      continue;
    }
    const existing = await database.employerCandidate.findUnique({
      where: { normalizedName: normalized },
      select: { id: true, source: true, status: true, notes: true },
    });

    if (!existing) {
      await database.employerCandidate.create({
        data: {
          name: employer.canonicalName,
          normalizedName: normalized,
          source: SEED_SOURCE,
          status: "Pending",
          notes: `Curated seed (${employer.confidenceBand}) · ${employer.officialDomain}`,
        },
      });
      summary.created += 1;
      continue;
    }
    if (existing.source === SEED_SOURCE) {
      summary.alreadySeeded += 1;
      continue;
    }
    if (existing.status === "Resolved") {
      // Already produced a board; re-provenancing changes nothing downstream.
      summary.skippedResolved += 1;
      summary.skipped.push({
        name: employer.canonicalName,
        reason: `already resolved via ${existing.source}; left untouched`,
      });
      continue;
    }
    await database.employerCandidate.update({
      where: { id: existing.id },
      data: {
        source: SEED_SOURCE,
        notes: `Curated seed (${employer.confidenceBand}) · ${employer.officialDomain}`
          + ` · previously harvested from ${existing.source}`,
      },
    });
    summary.promoted += 1;
  }
  return summary;
}

export type TargetEmployerView = {
  id: string;
  name: string;
  state: TargetState;
  provider: string | null;
  boardToken: string | null;
  careerUrl: string | null;
  validationStatus: string | null;
  jobsAvailable: number | null;
  confidence: number | null;
  connectorId: string | null;
  notes: string | null;
};

/**
 * Records employers the user explicitly wants watched.
 *
 * Accepts company names or ATS URLs. A recognisable ATS URL is short-circuited
 * through the existing detector — provider and board token are then known
 * outright, so no probing is required for it later.
 */
export async function addTargetEmployers(
  database: PrismaClient,
  rawInput: string,
): Promise<{ added: string[]; alreadyTracked: string[]; rejected: string[]; detected: number }> {
  const entries = rawInput
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, MAX_TARGET_BATCH);

  const added: string[] = [];
  const alreadyTracked: string[] = [];
  const rejected: string[] = [];
  let detected = 0;

  for (const entry of entries) {
    const fromUrl = /^https?:\/\//i.test(entry) ? detectCompanySource(entry) : null;
    // For a URL we key the employer on the board token; for a name, on the name.
    const label = fromUrl ? fromUrl.connectorKey : entry;
    const normalized = normalizeCompanyName(label);
    if (!normalized || normalized.length < 2) {
      rejected.push(entry);
      continue;
    }

    const existing = await database.employerCandidate.findUnique({
      where: { normalizedName: normalized },
      select: { id: true, source: true },
    });
    if (existing) {
      // Promote a market-discovered candidate to a user target rather than
      // creating a duplicate identity for the same employer.
      if (existing.source !== TARGET_SOURCE) {
        await database.employerCandidate.update({
          where: { id: existing.id },
          data: { source: TARGET_SOURCE, status: "Pending", attempts: 0 },
        });
        added.push(label);
      } else {
        alreadyTracked.push(label);
      }
      continue;
    }

    await database.employerCandidate.create({
      data: {
        name: label,
        normalizedName: normalized,
        source: TARGET_SOURCE,
        status: "Pending",
        resolvedProvider: fromUrl?.providerId ?? null,
        resolvedKey: fromUrl?.connectorKey ?? null,
        notes: fromUrl ? `Provider detected from URL: ${fromUrl.providerName}.` : null,
      },
    });
    if (fromUrl) detected += 1;
    added.push(label);
  }

  return { added, alreadyTracked, rejected, detected };
}

export async function listTargetEmployers(
  database: PrismaClient,
): Promise<TargetEmployerView[]> {
  const candidates = await database.employerCandidate.findMany({
    where: { source: TARGET_SOURCE },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const connectorIds = candidates
    .map((candidate) => candidate.connectorId)
    .filter((value): value is string => Boolean(value));
  const connectors = connectorIds.length
    ? await database.companyConnector.findMany({
      where: { id: { in: connectorIds } },
      select: {
        id: true, atsType: true, connectorKey: true, careerUrl: true,
        validationStatus: true, jobsAvailable: true, discoveryConfidence: true,
      },
    })
    : [];
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));

  return candidates.map((candidate) => {
    const connector = candidate.connectorId ? byId.get(candidate.connectorId) : undefined;
    return {
      id: candidate.id,
      name: candidate.name,
      state: targetState(candidate.status, candidate.attempts),
      provider: connector?.atsType ?? candidate.resolvedProvider,
      boardToken: connector?.connectorKey ?? candidate.resolvedKey,
      careerUrl: connector?.careerUrl ?? null,
      validationStatus: connector?.validationStatus ?? null,
      jobsAvailable: connector?.jobsAvailable ?? null,
      confidence: connector?.discoveryConfidence ?? null,
      connectorId: candidate.connectorId,
      notes: candidate.notes,
    };
  });
}

/** Resolves ONLY unresolved target employers. Never touches the backlog. */
export async function resolveTargetEmployers(
  database: PrismaClient,
  options: { client?: typeof fetch } = {},
) {
  const targets = await database.employerCandidate.findMany({
    where: {
      source: TARGET_SOURCE,
      status: { in: ["Pending", "Resolving", "Unresolved"] },
    },
    select: { id: true },
    take: MAX_TARGET_BATCH,
  });
  if (!targets.length) {
    return {
      attempted: 0, resolved: 0, unresolved: 0, probesUsed: 0,
      boardsRegistered: 0, collisions: 0, jobsReachable: 0, byProvider: {},
    } satisfies ResolveSummary;
  }
  return resolveCandidates(database, {
    client: options.client,
    candidateIds: targets.map((target) => target.id),
  });
}

/** Connector ids for resolved target employers — the bounded scan scope. */
export async function targetBoardIds(database: PrismaClient) {
  const resolved = await database.employerCandidate.findMany({
    where: { source: TARGET_SOURCE, status: "Resolved", connectorId: { not: null } },
    select: { connectorId: true },
    take: MAX_TARGET_BATCH,
  });
  return resolved
    .map((row) => row.connectorId)
    .filter((value): value is string => Boolean(value));
}

/**
 * Re-probes registered boards. A board that stops returning jobs, or whose
 * identity fingerprint changes, is flagged rather than left silently reporting
 * healthy — the failure mode that hid a dead board for weeks.
 */
export async function revalidateBoards(
  database: PrismaClient,
  options: { client?: typeof fetch; limit?: number } = {},
): Promise<RevalidationSummary> {
  const client = options.client ?? fetch;
  const gate = new RobotsGate(client);
  const connectors = await database.companyConnector.findMany({
    where: { enabled: true },
    orderBy: { lastValidatedAt: "asc" },
    take: options.limit ?? 500,
    select: { id: true, company: true, atsType: true, connectorKey: true, boardFingerprint: true },
  });

  const summary: RevalidationSummary = { checked: 0, healthy: 0, stale: 0, failed: 0 };
  for (const connector of connectors) {
    const probe = BOARD_PROBES.find((entry) => entry.providerId === connector.atsType);
    if (!probe) continue;
    summary.checked += 1;
    const attempt = await probeBoard(client, gate, connector.company, {
      token: connector.connectorKey,
      exact: true,
    });
    if (!attempt.board) {
      summary.failed += 1;
      await database.companyConnector.update({
        where: { id: connector.id },
        data: { validationStatus: "Failed", jobsAvailable: 0, lastValidatedAt: new Date() },
      });
      continue;
    }
    const changed = Boolean(connector.boardFingerprint)
      && connector.boardFingerprint !== attempt.board.fingerprint;
    if (changed) summary.stale += 1;
    else summary.healthy += 1;
    await database.companyConnector.update({
      where: { id: connector.id },
      data: {
        validationStatus: changed ? "Stale" : "Validated",
        jobsAvailable: attempt.board.jobCount,
        boardFingerprint: attempt.board.fingerprint,
        lastValidatedAt: new Date(),
      },
    });
  }
  return summary;
}
