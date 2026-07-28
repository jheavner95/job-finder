"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  configureTeamtailorCredential,
  removeTeamtailorCredential,
  testTeamtailorCredential,
} from "@/lib/job-sources/services/teamtailor-credential-service";

const credentialSchema = z.object({
  connectorId: z.string().min(1),
  apiKey: z.string().trim().min(1).max(2_000),
  region: z.enum(["eu", "na"]),
  apiVersion: z.string().regex(/^\d{8}$/).default("20240404"),
});

export async function configureTeamtailorCredentialAction(formData: FormData) {
  const parsed = credentialSchema.safeParse({
    connectorId: formData.get("connectorId"),
    apiKey: formData.get("apiKey"),
    region: formData.get("region"),
    apiVersion: formData.get("apiVersion") || "20240404",
  });
  if (!parsed.success) redirect("/sources?error=invalid-teamtailor-credential");
  try {
    await configureTeamtailorCredential(prisma, parsed.data);
  } catch {
    redirect("/sources?error=teamtailor-authentication-failed");
  }
  revalidatePath("/sources");
  redirect("/sources?credential=valid");
}

export async function testTeamtailorCredentialAction(formData: FormData) {
  const connectorId = String(formData.get("connectorId") ?? "");
  if (!connectorId) redirect("/sources?error=invalid-teamtailor-connector");
  try {
    await testTeamtailorCredential(prisma, connectorId);
  } catch {
    redirect("/sources?error=teamtailor-authentication-failed");
  }
  revalidatePath("/sources");
  redirect("/sources?credential=valid");
}

export async function removeTeamtailorCredentialAction(formData: FormData) {
  const connectorId = String(formData.get("connectorId") ?? "");
  if (!connectorId) redirect("/sources?error=invalid-teamtailor-connector");
  await removeTeamtailorCredential(prisma, connectorId);
  revalidatePath("/sources");
  redirect("/sources?credential=removed");
}
