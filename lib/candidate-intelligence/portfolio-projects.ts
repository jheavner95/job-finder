import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { CANDIDATE_ID, recalculateResumeEvidence } from "../onboarding";
import { ensureOpportunityIntelligence } from "./service";

async function refreshProjectConsumers(database: PrismaClient) {
  await recalculateResumeEvidence(database);
  await ensureOpportunityIntelligence(database, { force: true });
}

function uniqueIds(projectIds: string[]) {
  return [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
}

export async function addPortfolioProject(database: PrismaClient, name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Project name is required.");
  const existing = await database.candidatePortfolioProject.findUnique({
    where: {
      profileId_name: {
        profileId: CANDIDATE_ID,
        name: normalizedName,
      },
    },
  });
  if (existing && !existing.archivedAt) {
    throw new Error("A project with this name already exists.");
  }
  const project = existing
    ? await database.candidatePortfolioProject.update({
        where: { id: existing.id },
        data: { archivedAt: null },
      })
    : await database.candidatePortfolioProject.create({
        data: {
          id: `portfolio-${randomUUID()}`,
          profileId: CANDIDATE_ID,
          name: normalizedName,
          evidenceStatus: "needs-evidence",
          sourceDocument: "user-created",
          sourceExcerpt: `${normalizedName} was added manually. No project evidence has been supplied yet.`,
          evidenceQuality: "Unknown",
        },
      });
  await refreshProjectConsumers(database);
  return project;
}

export async function archivePortfolioProjects(
  database: PrismaClient,
  projectIds: string[],
) {
  const ids = uniqueIds(projectIds);
  if (!ids.length) return { archived: 0 };
  const result = await database.candidatePortfolioProject.updateMany({
    where: {
      id: { in: ids },
      profileId: CANDIDATE_ID,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });
  await refreshProjectConsumers(database);
  return { archived: result.count };
}

export async function restorePortfolioProjects(
  database: PrismaClient,
  projectIds: string[],
) {
  const ids = uniqueIds(projectIds);
  if (!ids.length) return { restored: 0 };
  const result = await database.candidatePortfolioProject.updateMany({
    where: {
      id: { in: ids },
      profileId: CANDIDATE_ID,
      archivedAt: { not: null },
    },
    data: { archivedAt: null },
  });
  await refreshProjectConsumers(database);
  return { restored: result.count };
}

export async function removePortfolioProjects(
  database: PrismaClient,
  projectIds: string[],
) {
  const ids = uniqueIds(projectIds);
  if (!ids.length) return { removed: 0 };
  const projects = await database.candidatePortfolioProject.findMany({
    where: { id: { in: ids }, profileId: CANDIDATE_ID },
    select: { id: true },
  });
  const ownedIds = projects.map((project) => project.id);
  if (!ownedIds.length) return { removed: 0 };
  await database.$transaction(async (transaction) => {
    await transaction.candidateProjectProgress.deleteMany({
      where: {
        profileId: CANDIDATE_ID,
        projectId: { in: ownedIds },
      },
    });
    await transaction.candidatePortfolioProject.deleteMany({
      where: {
        id: { in: ownedIds },
        profileId: CANDIDATE_ID,
      },
    });
  });
  await refreshProjectConsumers(database);
  return { removed: ownedIds.length };
}

export async function removeUnstartedPortfolioProjects(database: PrismaClient) {
  const projects = await database.candidatePortfolioProject.findMany({
    where: {
      profileId: CANDIDATE_ID,
      archivedAt: null,
      portfolioReadiness: 0,
    },
    select: { id: true },
  });
  return removePortfolioProjects(database, projects.map((project) => project.id));
}
