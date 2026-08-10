import { beforeEach, describe, expect, it } from "vitest";

import {
  SEED_SOURCE,
  isPlausibleDomain,
  registerSeedEmployers,
  resolveCandidates,
  type SeedEmployerEntry,
} from "../lib/job-sources/services/employer-discovery";
import { normalizeCompanyName } from "../lib/job-sources/board-resolution";

/**
 * An in-memory stand-in for the one Prisma delegate `registerSeedEmployers`
 * touches. Registration is pure bookkeeping — nothing here needs a database,
 * and every write is recorded so the idempotency claims can be checked rather
 * than asserted.
 */
type Row = {
  id: string;
  name: string;
  normalizedName: string;
  source: string;
  status: string;
  officialDomain: string | null;
  notes: string | null;
};

function fakeDatabase(seed: Row[] = []) {
  const rows = new Map(seed.map((row) => [row.normalizedName, { ...row }]));
  const writes: Array<{ op: "create" | "update"; name: string; data: Record<string, unknown> }> = [];
  let counter = seed.length;

  const database = {
    employerCandidate: {
      findUnique: async ({ where }: { where: { normalizedName: string } }) =>
        rows.get(where.normalizedName) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        counter += 1;
        const row: Row = {
          id: `row-${counter}`,
          name: String(data.name),
          normalizedName: String(data.normalizedName),
          source: String(data.source),
          status: String(data.status),
          officialDomain: (data.officialDomain as string | null) ?? null,
          notes: (data.notes as string | null) ?? null,
        };
        rows.set(row.normalizedName, row);
        writes.push({ op: "create", name: row.name, data });
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = [...rows.values()].find((entry) => entry.id === where.id);
        if (!row) throw new Error(`no row ${where.id}`);
        Object.assign(row, data);
        writes.push({ op: "update", name: row.name, data });
        return row;
      },
    },
  };
  return { database, rows, writes };
}

function row(overrides: Partial<Row> & { name: string }): Row {
  return {
    id: `seeded-${overrides.name}`,
    normalizedName: normalizeCompanyName(overrides.name),
    source: SEED_SOURCE,
    status: "Resolved",
    officialDomain: null,
    notes: null,
    ...overrides,
  };
}

const entry = (over: Partial<SeedEmployerEntry> & { canonicalName: string }): SeedEmployerEntry => ({
  officialDomain: "example.com",
  confidenceBand: "HIGH",
  status: "active",
  ...over,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const register = (database: ReturnType<typeof fakeDatabase>["database"], entries: SeedEmployerEntry[]) =>
  registerSeedEmployers(database as any, entries);
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("domain shape", () => {
  it("accepts real hostnames", () => {
    for (const domain of ["glean.com", "poly.ai", "dust.tt", "sub.example.co.uk"]) {
      expect(isPlausibleDomain(domain), domain).toBe(true);
    }
  });

  it("rejects anything that is not one", () => {
    // The retired artifact entry records its domain as the word "unverified".
    for (const value of ["unverified", "", "not a domain", "https://glean.com", "localhost", "10.0.0.1"]) {
      expect(isPlausibleDomain(value), value).toBe(false);
    }
  });
});

describe("registration persists the reviewed domain", () => {
  it("writes it on a newly created candidate", async () => {
    const { database, rows } = fakeDatabase();
    const summary = await register(database, [entry({ canonicalName: "Glean", officialDomain: "glean.com" })]);
    expect(summary.created).toBe(1);
    expect(summary.domainsWritten).toBe(1);
    expect(rows.get("glean")?.officialDomain).toBe("glean.com");
  });

  it("backfills an existing seed candidate that has none", async () => {
    const { database, rows } = fakeDatabase([row({ name: "Sierra" })]);
    const summary = await register(database, [entry({ canonicalName: "Sierra", officialDomain: "sierra.ai" })]);
    expect(summary.created).toBe(0);
    expect(summary.alreadySeeded).toBe(1);
    expect(summary.domainsWritten).toBe(1);
    expect(rows.get("sierra")?.officialDomain).toBe("sierra.ai");
  });

  it("adds the domain without touching identity on a resolved candidate", async () => {
    const before = row({ name: "Abridge", status: "Resolved", source: SEED_SOURCE, notes: "Curated seed" });
    const { database, rows } = fakeDatabase([before]);
    await register(database, [entry({ canonicalName: "Abridge", officialDomain: "abridge.com" })]);
    const after = rows.get("abridge")!;
    expect(after.officialDomain).toBe("abridge.com");
    expect(after.status).toBe("Resolved");
    expect(after.source).toBe(SEED_SOURCE);
    expect(after.notes).toBe("Curated seed");
  });

  it("records the domain on a resolved non-seed candidate without re-provenancing it", async () => {
    // ElevenLabs entered through a market source and already has a board.
    const { database, rows } = fakeDatabase([
      row({ name: "ElevenLabs", source: "arbeitnow", status: "Resolved" }),
    ]);
    const summary = await register(database, [entry({ canonicalName: "ElevenLabs", officialDomain: "elevenlabs.io" })]);
    expect(summary.skippedResolved).toBe(1);
    expect(rows.get("elevenlabs")?.source).toBe("arbeitnow");
    expect(rows.get("elevenlabs")?.officialDomain).toBe("elevenlabs.io");
  });

  it("does not persist a domain that is not a hostname", async () => {
    const { database, rows } = fakeDatabase();
    const summary = await register(database, [
      entry({ canonicalName: "Placeholder Co", officialDomain: "unverified", status: "active" }),
    ]);
    expect(rows.get("placeholder co")?.officialDomain).toBeNull();
    expect(summary.skipped.some((item) => /not a hostname/.test(item.reason))).toBe(true);
  });
});

describe("a retired entry never becomes a candidate", () => {
  it("is skipped entirely", async () => {
    const { database, rows, writes } = fakeDatabase();
    const summary = await register(database, [
      entry({ canonicalName: "/dev/agents", officialDomain: "unverified", status: "retired" }),
    ]);
    expect(summary.created).toBe(0);
    expect(rows.size).toBe(0);
    expect(writes).toHaveLength(0);
    expect(summary.skipped[0].reason).toMatch(/retired/);
  });

  it("is not revived even if it was persisted before retirement", async () => {
    const { database, rows } = fakeDatabase([row({ name: "/dev/agents", status: "Unresolved" })]);
    await register(database, [entry({ canonicalName: "/dev/agents", status: "retired" })]);
    expect(rows.get(normalizeCompanyName("/dev/agents"))?.status).toBe("Unresolved");
  });
});

describe("conflicts are reported, never resolved by overwriting", () => {
  it("leaves a differing persisted domain in place", async () => {
    const { database, rows } = fakeDatabase([row({ name: "Ada", officialDomain: "ada.example" })]);
    const summary = await register(database, [entry({ canonicalName: "Ada", officialDomain: "ada.cx" })]);
    expect(summary.domainConflicts).toEqual([
      { name: "Ada", persisted: "ada.example", artifact: "ada.cx" },
    ]);
    expect(rows.get("ada")?.officialDomain).toBe("ada.example");
    expect(summary.domainsWritten).toBe(0);
  });
});

describe("idempotency", () => {
  const artifact = [
    entry({ canonicalName: "Glean", officialDomain: "glean.com" }),
    entry({ canonicalName: "Sierra", officialDomain: "sierra.ai" }),
    entry({ canonicalName: "/dev/agents", officialDomain: "unverified", status: "retired" }),
  ];

  let harness: ReturnType<typeof fakeDatabase>;
  beforeEach(() => {
    harness = fakeDatabase([row({ name: "Sierra" })]);
  });

  it("creates nothing and writes nothing on a second run", async () => {
    const first = await register(harness.database, artifact);
    expect(first.created + first.domainsWritten).toBeGreaterThan(0);
    const writesAfterFirst = harness.writes.length;

    const second = await register(harness.database, artifact);
    expect(second.created).toBe(0);
    expect(second.domainsWritten).toBe(0);
    expect(second.domainConflicts).toHaveLength(0);
    expect(second.domainsAlreadyCorrect).toBe(2);
    // Not one further database write.
    expect(harness.writes.length).toBe(writesAfterFirst);
  });

  it("produces no duplicate candidates", async () => {
    await register(harness.database, artifact);
    await register(harness.database, artifact);
    await register(harness.database, artifact);
    expect(harness.rows.size).toBe(2);
    expect([...harness.rows.keys()].sort()).toEqual(["glean", "sierra"]);
  });
});

/* ------------------------------------------------------------------ *
 * Scoped resolution
 * ------------------------------------------------------------------ */

type Candidate = {
  id: string;
  name: string;
  source: string;
  status: string;
  attempts: number;
  officialDomain: string | null;
  connectorId: string | null;
};

/** Enough of the Prisma surface for `resolveCandidates`, and a record of what it asked for. */
function resolutionDatabase(candidates: Candidate[]) {
  const queries: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  const rows = candidates.map((candidate) => ({ ...candidate }));
  const database = {
    employerCandidate: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        queries.push(where);
        const ids = (where.id as { in?: string[] } | undefined)?.in;
        return ids ? rows.filter((row) => ids.includes(row.id)) : rows;
      },
      updateMany: async () => ({ count: 0 }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((entry) => entry.id === where.id);
        if (row) Object.assign(row, { status: data.status ?? row.status });
        return row;
      },
    },
    companyConnector: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `connector-${created.length}` };
      },
    },
  };
  return { database, queries, created, rows };
}

describe("scoped careers-first resolution", () => {
  const seedCandidate: Candidate = {
    id: "seed-1",
    name: "Testco",
    source: SEED_SOURCE,
    status: "Unresolved",
    attempts: 1,
    officialDomain: "testco.test",
    connectorId: null,
  };
  const backlogCandidate: Candidate = {
    id: "market-1",
    name: "Backlog Corp",
    source: "arbeitnow",
    status: "Pending",
    attempts: 0,
    officialDomain: null,
    connectorId: null,
  };

  function careersClient(seen: string[]) {
    return (async (input: string | URL | Request) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (url === "https://testco.test") {
        return new Response(`<a href="/careers">Careers</a>`, { status: 200 });
      }
      if (url === "https://testco.test/careers") {
        return new Response(`<a href="https://jobs.ashbyhq.com/testco-hq">Roles</a>`, { status: 200 });
      }
      if (url.includes("api.ashbyhq.com/posting-api/job-board/testco-hq")) {
        return new Response(JSON.stringify({ jobs: [{ jobUrl: "https://jobs.ashbyhq.com/testco-hq/1" }] }), { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;
  }

  it("hands the persisted domain to careers discovery and resolves from it", async () => {
    const { database, created } = resolutionDatabase([seedCandidate]);
    const seen: string[] = [];
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const summary = await resolveCandidates(database as any, {
      candidateIds: ["seed-1"],
      client: careersClient(seen),
    });

    // The domain was used: the employer's own surface was fetched.
    expect(seen).toContain("https://testco.test/careers");
    expect(summary.resolved).toBe(1);
    // And the token came from the ATS URL, not from the company name.
    expect(created[0]).toMatchObject({
      company: "Testco",
      atsType: "ashby",
      connectorKey: "testco-hq",
      discoverySource: `careers:${SEED_SOURCE}`,
    });
  });

  it("never touches a candidate outside the scoped ids", async () => {
    const { database, queries } = resolutionDatabase([seedCandidate, backlogCandidate]);
    const seen: string[] = [];
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    await resolveCandidates(database as any, {
      candidateIds: ["seed-1"],
      client: careersClient(seen),
    });

    // The selection is by explicit id, never the Pending backlog sweep.
    expect(queries[0]).toEqual({ id: { in: ["seed-1"] } });
    expect(queries[0]).not.toHaveProperty("status");
    // Nothing was fetched on the backlog candidate's behalf.
    expect(seen.some((url) => url.includes("backlog"))).toBe(false);
  });

  it("registers a board that has never been crawled", async () => {
    const { database, created } = resolutionDatabase([seedCandidate]);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    await resolveCandidates(database as any, { candidateIds: ["seed-1"], client: careersClient([]) });
    expect(created[0]).not.toHaveProperty("lastSuccessfulFetch");
    expect(created[0]).not.toHaveProperty("crawlRuns");
  });
});
