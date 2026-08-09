"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import {
  addTargetEmployers,
  resolveTargetEmployers,
  targetBoardIds,
} from "@/lib/job-sources/services/employer-discovery";
import { DiscoveryScheduler } from "@/lib/scheduling/discovery-scheduler";

export type TargetActionResult = {
  ok: boolean;
  message: string;
};

export async function addTargetsAction(
  _previous: TargetActionResult | null,
  formData: FormData,
): Promise<TargetActionResult> {
  const input = String(formData.get("employers") ?? "").trim();
  if (!input) return { ok: false, message: "Enter at least one company name or ATS URL." };

  const result = await addTargetEmployers(prisma, input);
  revalidatePath("/discovery");

  const parts: string[] = [];
  if (result.added.length) parts.push(`${result.added.length} added`);
  if (result.detected) parts.push(`${result.detected} recognised from an ATS URL`);
  if (result.alreadyTracked.length) parts.push(`${result.alreadyTracked.length} already tracked`);
  if (result.rejected.length) parts.push(`${result.rejected.length} could not be read`);
  return {
    ok: result.added.length > 0,
    message: parts.length ? parts.join(" · ") : "Nothing to add.",
  };
}

export async function resolveTargetsAction(): Promise<TargetActionResult> {
  const summary = await resolveTargetEmployers(prisma);
  revalidatePath("/discovery");
  if (!summary.attempted) return { ok: true, message: "Every target employer is already resolved." };
  return {
    ok: summary.resolved > 0,
    message: `${summary.resolved} of ${summary.attempted} resolved to a public board · ${summary.probesUsed} probe requests`,
  };
}

/**
 * Scans ONLY the boards belonging to resolved target employers. Deliberately
 * separate from resolution, and never a full-registry scan.
 */
export async function scanTargetsAction(): Promise<TargetActionResult> {
  const connectorIds = await targetBoardIds(prisma);
  if (!connectorIds.length) {
    return { ok: false, message: "No resolved target boards to scan yet." };
  }
  const active = await prisma.discoveryBatch.findFirst({
    where: { status: "Running" },
    select: { id: true },
  });
  if (active) return { ok: false, message: "A discovery run is already in progress." };

  const result = await new DiscoveryScheduler(prisma).run({
    trigger: "manual",
    connectorIds,
  });
  revalidatePath("/discovery");
  return {
    ok: result.status !== "Failed",
    message: `${result.companiesProcessed} target boards scanned · ${result.jobsDiscovered} postings retrieved · ${result.jobsImported} imported · ${result.duplicates} already known`,
  };
}
