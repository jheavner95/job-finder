"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { EMPTY_JOB_SEARCH } from "@/lib/job-sources/types";
import { detectCompanySource, type DetectedCompanySource } from "@/lib/job-sources/detection";
import { checkRobots } from "@/lib/job-sources/robots";
import { DiscoveryScheduler } from "@/lib/scheduling/discovery-scheduler";
import { GreenhouseProvider } from "@/lib/job-sources/providers/greenhouse";
import { DiscoveryService } from "@/lib/job-sources/services/discovery-service";

export type CompanyValidationState = {
  status: "idle" | "verified" | "blocked";
  company?: string;
  careerUrl?: string;
  message?: string;
  detection?: DetectedCompanySource;
  jobsDiscovered?: number;
  diagnosticId?: string;
  checks?: Array<{ label: string; detail: string; ok: boolean }>;
};

export async function validateCompanySourceAction(
  _previousState: CompanyValidationState,
  formData: FormData,
): Promise<CompanyValidationState> {
  const company = String(formData.get("company") ?? "").trim();
  const careerUrl = String(formData.get("careerUrl") ?? "").trim();
  const diagnosticId = crypto.randomUUID().slice(0, 8).toUpperCase();
  const base = { company, careerUrl, diagnosticId };
  if (!company || !URL.canParse(careerUrl)) {
    return {
      ...base,
      status: "blocked",
      message: "Enter a company name and a complete public career URL.",
      checks: [{ label: "Career URL", detail: "A valid public URL is required.", ok: false }],
    };
  }

  const detection = detectCompanySource(careerUrl);
  if (!detection) {
    return {
      ...base,
      status: "blocked",
      message: "The career platform was not recognized. Check the public careers URL and try again.",
      checks: [
        { label: "Career page", detail: "URL format accepted.", ok: true },
        { label: "Provider detection", detail: "No supported public provider was recognized.", ok: false },
      ],
    };
  }

  const checks: NonNullable<CompanyValidationState["checks"]> = [
    { label: "Provider detected", detail: detection.providerName, ok: true },
    { label: "Board identifier found", detail: detection.connectorKey, ok: true },
  ];
  const url = new URL(careerUrl);
  try {
    const pageResponse = await fetch(careerUrl, {
      headers: { "User-Agent": "job-search-intelligence/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!pageResponse.ok) throw new Error(`Career page returned ${pageResponse.status}.`);
    checks.unshift({ label: "Career page reachable", detail: "Public page responded successfully.", ok: true });

    const robots = await checkRobots(`${url.origin}/robots.txt`, url.pathname);
    checks.push({
      label: "Robots access",
      detail: robots.allowed ? "Public discovery path is permitted." : robots.reason,
      ok: robots.allowed,
    });
    if (!robots.allowed) {
      return {
        ...base,
        detection,
        status: "blocked",
        message: "The provider was detected, but its robots policy prevents automated discovery.",
        checks,
      };
    }

    const provider = jobSourceRegistry.get(detection.providerId);
    const jobs = await provider.discover(EMPTY_JOB_SEARCH, {
      company,
      careerUrl,
      connectorKey: detection.connectorKey,
      enabled: true,
      robotsPolicy: robots.policy,
      crawlDelay: robots.crawlDelay,
      rateLimit: 60,
    });
    checks.push(
      { label: "Public jobs endpoint", detail: detection.endpointLabel, ok: true },
      { label: "Jobs available", detail: `${jobs.length} public jobs discovered.`, ok: true },
    );
    return {
      ...base,
      detection,
      status: "verified",
      message: `${detection.providerName} was detected automatically. The public connection is ready.`,
      jobsDiscovered: jobs.length,
      checks,
    };
  } catch (error) {
    checks.push({
      label: "Public connection",
      detail: error instanceof Error ? error.message : "The public endpoint could not be verified.",
      ok: false,
    });
    return {
      ...base,
      detection,
      status: "blocked",
      message: "The provider was detected, but the public connection could not be verified.",
      checks,
    };
  }
}

const connectorSchema = z.object({
  company: z.string().trim().min(1).max(300),
  careerUrl: z.string().trim().url().max(2_000),
  connectorKey: z.string().trim().min(1).max(200),
  providerId: z.string().trim().min(1).max(100),
  crawlDelay: z.coerce.number().int().min(0).max(60_000).default(1_000),
  rateLimit: z.coerce.number().int().min(1).max(600).default(60),
  notes: z.string().trim().max(2_000).optional().default(""),
});

export async function addCompanyConnectorAction(formData: FormData) {
  const parsed = connectorSchema.safeParse({
    company: formData.get("company"),
    careerUrl: formData.get("careerUrl"),
    connectorKey: formData.get("connectorKey"),
    providerId: formData.get("providerId"),
    crawlDelay: formData.get("crawlDelay") || 1_000,
    rateLimit: formData.get("rateLimit") || 60,
    notes: formData.get("notes"),
  });
  if (!parsed.success) redirect("/sources?error=invalid-connector");
  try {
    jobSourceRegistry.get(parsed.data.providerId);
  } catch {
    redirect("/sources?error=unknown-provider");
  }

  const duplicate = await prisma.companyConnector.findFirst({
    where: {
      atsType: parsed.data.providerId,
      connectorKey: parsed.data.connectorKey,
      NOT: { company: parsed.data.company },
    },
  });
  if (duplicate) redirect("/sources?error=duplicate-board");

  if (parsed.data.providerId === "greenhouse") {
    try {
      const context = {
        company: parsed.data.company,
        careerUrl: parsed.data.careerUrl,
        connectorKey: parsed.data.connectorKey,
        enabled: true,
        robotsPolicy: "allow",
      };
      const healthResponse = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.data.connectorKey)}/jobs`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
      );
      if (!healthResponse.ok) redirect("/sources?error=board-unavailable");
      await new GreenhouseProvider().health(context);
    } catch {
      redirect("/sources?error=board-unavailable");
    }
  }

  await prisma.companyConnector.upsert({
    where: { company: parsed.data.company },
    update: {
      careerUrl: parsed.data.careerUrl,
      atsType: parsed.data.providerId,
      connectorKey: parsed.data.connectorKey,
      enabled: true,
      health: "Healthy",
      crawlDelay: parsed.data.crawlDelay,
      rateLimit: parsed.data.rateLimit,
      notes: parsed.data.notes || null,
      schedule: {
        upsert: {
          create: { scheduleType: "Manual" },
          update: {},
        },
      },
    },
    create: {
      company: parsed.data.company,
      careerUrl: parsed.data.careerUrl,
      atsType: parsed.data.providerId,
      connectorKey: parsed.data.connectorKey,
      crawlDelay: parsed.data.crawlDelay,
      rateLimit: parsed.data.rateLimit,
      enabled: true,
      health: "Healthy",
      searchCriteria: EMPTY_JOB_SEARCH,
      notes: parsed.data.notes || null,
      schedule: {
        create: { scheduleType: "Manual" },
      },
    },
  });
  revalidatePath("/sources");
  redirect("/sources?added=1");
}

function parseDirectoryFile(value: string, filename: string) {
  if (filename.toLowerCase().endsWith(".json")) {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("JSON must contain an array.");
    return parsed.map((row) => row as Record<string, unknown>);
  }
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  const headers = lines.shift()?.split(",").map((item) => item.trim()) ?? [];
  return lines.map((line) => Object.fromEntries(
    line.split(",").map((item, index) => [headers[index], item.trim()]),
  ));
}

export async function bulkImportGreenhouseBoardsAction(formData: FormData) {
  const file = formData.get("directory");
  if (!(file instanceof File) || file.size > 1_000_000) {
    redirect("/sources?error=invalid-directory");
  }
  let rows: Record<string, unknown>[];
  try {
    rows = parseDirectoryFile(await file.text(), file.name);
  } catch {
    redirect("/sources?error=invalid-directory");
  }
  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    const company = String(row.company ?? row.companyName ?? "").trim();
    const connectorKey = String(row.boardToken ?? row.connectorKey ?? row.token ?? "").trim();
    const careerUrl = String(row.canonicalBoardUrl ?? row.careerUrl
      ?? `https://boards.greenhouse.io/${connectorKey}`).trim();
    if (!company || !connectorKey || !URL.canParse(careerUrl)) {
      skipped += 1;
      continue;
    }
    const existing = await prisma.companyConnector.findFirst({
      where: { OR: [{ company }, { atsType: "greenhouse", connectorKey }] },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.companyConnector.create({
      data: {
        company,
        careerUrl,
        atsType: "greenhouse",
        connectorKey,
        enabled: row.enabled !== false && String(row.enabled).toLowerCase() !== "false",
        health: "Warning",
        searchCriteria: EMPTY_JOB_SEARCH,
        schedule: { create: { scheduleType: "Manual" } },
      },
    });
    added += 1;
  }
  revalidatePath("/sources");
  redirect(`/sources?bulkAdded=${added}&bulkSkipped=${skipped}`);
}

function greenhouseBoardFromUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
      return parts[0] || null;
    }
    if (host.endsWith(".greenhouse.io") && parts[0] === "jobs") {
      return url.searchParams.get("for");
    }
    return null;
  } catch {
    return null;
  }
}

function greenhouseJobId(value: string) {
  try {
    const url = new URL(value);
    return url.searchParams.get("gh_jid")
      ?? url.pathname.split("/").filter(Boolean).at(-1)?.match(/^\d+$/)?.[0]
      ?? null;
  } catch {
    return null;
  }
}

export async function compareMyGreenhouseUrlsAction(formData: FormData) {
  const input = String(formData.get("urls") ?? "");
  const urls = input.split(/\s+/).filter(Boolean).slice(0, 250);
  await prisma.greenhouseComparisonItem.deleteMany({});
  for (const submittedUrl of urls) {
    const boardToken = greenhouseBoardFromUrl(submittedUrl);
    const connector = boardToken
      ? await prisma.companyConnector.findFirst({
          where: { atsType: "greenhouse", connectorKey: boardToken },
        })
      : null;
    let status = !boardToken ? "Unresolved" : connector ? "Covered" : "Missing board";
    let reason = !boardToken
      ? "URL could not be resolved to a public Greenhouse company board."
      : connector
        ? "The company board already exists in Job Finder."
        : "The public company board is not registered. Add it before importing through the certified pipeline.";
    const externalId = greenhouseJobId(submittedUrl);
    if (connector && externalId) {
      try {
        const result = await new DiscoveryService(prisma).evaluateAndImport(
          "greenhouse",
          {
            providerId: "greenhouse",
            externalId,
            title: "Greenhouse comparison import",
            company: connector.company,
            canonicalUrl: submittedUrl,
            discoveredVia: "canonical",
          },
          {
            company: connector.company,
            careerUrl: connector.careerUrl,
            connectorKey: connector.connectorKey,
            enabled: connector.enabled,
            robotsPolicy: connector.robotsPolicy,
            crawlDelay: connector.crawlDelay,
            rateLimit: connector.rateLimit,
          },
        );
        status = result.duplicate ? "Covered · duplicate" : "Covered · imported";
        reason = result.duplicate
          ? "The board exists and the canonical posting was already in Job Finder."
          : "The board exists and the canonical posting was imported through the certified pipeline.";
      } catch (error) {
        status = "Import warning";
        reason = error instanceof Error ? error.message : "Canonical import failed.";
      }
    }
    await prisma.greenhouseComparisonItem.create({
      data: {
        submittedUrl,
        canonicalUrl: boardToken ? submittedUrl : null,
        boardToken,
        companyName: connector?.company,
        connectorId: connector?.id,
        status,
        reason,
      },
    });
  }
  revalidatePath("/sources");
  redirect(`/sources?compared=${urls.length}`);
}

export async function addMissingGreenhouseBoardAction(formData: FormData) {
  const boardToken = String(formData.get("boardToken") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  if (!boardToken || !company) redirect("/sources?error=invalid-connector");
  const existing = await prisma.companyConnector.findFirst({
    where: { OR: [{ company }, { atsType: "greenhouse", connectorKey: boardToken }] },
  });
  if (existing) redirect("/sources?error=duplicate-board");
  await prisma.companyConnector.create({
    data: {
      company,
      careerUrl: `https://boards.greenhouse.io/${boardToken}`,
      atsType: "greenhouse",
      connectorKey: boardToken,
      enabled: true,
      health: "Warning",
      searchCriteria: EMPTY_JOB_SEARCH,
      schedule: { create: { scheduleType: "Manual" } },
    },
  });
  revalidatePath("/sources");
  redirect("/sources?added=1");
}

export async function runProviderDiscoveryAction(formData: FormData) {
  const connectorId = String(formData.get("connectorId") ?? "");
  const connector = await prisma.companyConnector.findUnique({
    where: { id: connectorId },
    select: { id: true, enabled: true },
  });
  if (!connector?.enabled) redirect("/sources?error=unavailable-connector");
  const summary = await new DiscoveryScheduler(prisma).run({
    trigger: "manual",
    connectorIds: [connector.id],
  });
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/sources");
  revalidatePath("/briefing");
  revalidatePath("/notifications");
  redirect(`/sources?${new URLSearchParams({
    companies: String(summary.companiesProcessed),
    found: String(summary.jobsDiscovered),
    imported: String(summary.jobsImported),
    duplicates: String(summary.duplicates),
    failures: String(summary.failures),
  })}`);
}

export async function runScheduledDiscoveryAction() {
  const summary = await new DiscoveryScheduler(prisma).run({
    trigger: "scheduled",
  });
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/sources");
  revalidatePath("/briefing");
  revalidatePath("/notifications");
  redirect(`/sources?${new URLSearchParams({
    scheduled: "1",
    companies: String(summary.companiesProcessed),
    found: String(summary.jobsDiscovered),
    imported: String(summary.jobsImported),
    duplicates: String(summary.duplicates),
    failures: String(summary.failures),
  })}`);
}

export async function toggleConnectorAction(formData: FormData) {
  const connectorId = String(formData.get("connectorId") ?? "");
  const enabled = formData.get("enabled") === "true";
  await prisma.companyConnector.update({
    where: { id: connectorId },
    data: {
      enabled,
      health: enabled ? "Warning" : "Disabled",
    },
  });
  revalidatePath("/sources");
  revalidatePath("/searches");
}

export async function validateConnectorAction(formData: FormData) {
  const connectorId = String(formData.get("connectorId") ?? "");
  const connector = await prisma.companyConnector.findUnique({ where: { id: connectorId } });
  if (!connector) redirect("/sources?error=unavailable-connector");
  const startedAt = new Date();
  try {
    const jobs = await jobSourceRegistry.get(connector.atsType).discover(EMPTY_JOB_SEARCH, {
      company: connector.company,
      careerUrl: connector.careerUrl,
      connectorKey: connector.connectorKey,
      enabled: true,
      robotsPolicy: connector.robotsPolicy,
      crawlDelay: connector.crawlDelay,
      rateLimit: connector.rateLimit,
    });
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.companyConnector.update({
        where: { id: connector.id },
        data: { health: "Healthy", lastChecked: completedAt },
      }),
      prisma.connectorCrawl.create({
        data: {
          connectorId: connector.id,
          status: "Validation",
          startedAt,
          completedAt,
          jobsDiscovered: jobs.length,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          metadata: { validation: true, result: "Verified" },
        },
      }),
    ]);
    revalidatePath("/sources");
    redirect(`/sources?validated=1&company=${encodeURIComponent(connector.company)}`);
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "Validation failed.";
    await prisma.$transaction([
      prisma.companyConnector.update({
        where: { id: connector.id },
        data: { health: "Warning", lastChecked: completedAt },
      }),
      prisma.connectorCrawl.create({
        data: {
          connectorId: connector.id,
          status: "Validation failed",
          startedAt,
          completedAt,
          failures: 1,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          lastError: message,
          metadata: { validation: true, result: "Blocked" },
        },
      }),
    ]);
    revalidatePath("/sources");
    redirect(`/sources?validationFailed=1&company=${encodeURIComponent(connector.company)}`);
  }
}

export async function removeConnectorAction(formData: FormData) {
  const connectorId = String(formData.get("connectorId") ?? "");
  if (!connectorId) redirect("/sources?error=unavailable-connector");
  await prisma.companyConnector.delete({ where: { id: connectorId } });
  revalidatePath("/sources");
  revalidatePath("/searches");
  redirect("/sources?removed=1");
}
