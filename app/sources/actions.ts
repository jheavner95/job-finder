"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { EMPTY_JOB_SEARCH } from "@/lib/job-sources/types";
import { DiscoveryScheduler } from "@/lib/scheduling/discovery-scheduler";
import { GreenhouseProvider } from "@/lib/job-sources/providers/greenhouse";
import { DiscoveryService } from "@/lib/job-sources/services/discovery-service";

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
      enabled: false,
      health: "Disabled",
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
