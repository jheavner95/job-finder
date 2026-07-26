"use server";

import { revalidatePath } from "next/cache";

import { restorePortfolioProjects } from "@/lib/candidate-intelligence/portfolio-projects";
import { prisma } from "@/lib/db";

export async function restoreArchivedProject(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) throw new Error("Project is required.");
  await restorePortfolioProjects(prisma, [projectId]);
  revalidatePath("/evidence");
  revalidatePath("/getting-started");
  revalidatePath("/");
  revalidatePath("/briefing");
  revalidatePath("/review");
}
