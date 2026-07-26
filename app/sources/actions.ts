"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { jobSourceRegistry } from "@/lib/job-sources/registry";
import { EMPTY_JOB_SEARCH } from "@/lib/job-sources/types";
import { DiscoveryScheduler } from "@/lib/scheduling/discovery-scheduler";

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
