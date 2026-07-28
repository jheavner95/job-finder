"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  configureJobviteFeed,
  removeJobviteFeed,
} from "@/lib/job-sources/services/jobvite-feed-service";

const feedSchema = z.object({
  connectorId: z.string().min(1),
  feedUrl: z.string().url().max(4_000),
  employerId: z.string().trim().min(1).max(200),
});

export async function configureJobviteFeedAction(formData: FormData) {
  const parsed = feedSchema.safeParse({
    connectorId: formData.get("connectorId"),
    feedUrl: formData.get("feedUrl"),
    employerId: formData.get("employerId"),
  });
  if (!parsed.success) redirect("/sources?error=invalid-jobvite-feed");
  try {
    await configureJobviteFeed(prisma, parsed.data);
  } catch {
    redirect("/sources?error=jobvite-feed-validation-failed");
  }
  revalidatePath("/sources");
  redirect("/sources?feed=valid");
}

export async function removeJobviteFeedAction(formData: FormData) {
  const connectorId = String(formData.get("connectorId") ?? "");
  if (!connectorId) redirect("/sources?error=invalid-jobvite-connector");
  await removeJobviteFeed(prisma, connectorId);
  revalidatePath("/sources");
  redirect("/sources?feed=removed");
}
