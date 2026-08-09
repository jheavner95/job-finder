import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  addPortfolioProject,
  archivePortfolioProjects,
  removePortfolioProjects,
  removeUnstartedPortfolioProjects,
  restorePortfolioProjects,
} from "../lib/candidate-intelligence/portfolio-projects";
import { syncCandidateProfile } from "../lib/candidate-intelligence/profile-sync";
import { getOnboardingState } from "../lib/onboarding";
import { createTestDatabase, releaseTestDatabases } from "./test-database";

async function isolatedDatabase() {
  const database = await createTestDatabase({ label: "portfolio" });
  await database.candidateProjectProgress.deleteMany({
    where: { profileId: "primary-candidate" },
  });
  await database.candidatePortfolioProject.deleteMany({
    where: { profileId: "primary-candidate" },
  });
  return database;
}

afterEach(releaseTestDatabases);

describe("portfolio project management", () => {
  it("archives, excludes, restores, and permanently removes one project safely", async () => {
    const database = await isolatedDatabase();
    const jobsBefore = await database.job.count();
    const resumeBefore = await database.candidateResumeEvidence.count();
    const decisionsBefore = await database.userDecision.count();
    const project = await addPortfolioProject(database, "Fictional Atlas Workspace");
    await database.candidatePortfolioProject.update({
      where: { id: project.id },
      data: {
        portfolioReadiness: 80,
        evidenceQuality: "Confirmed",
        sourceExcerpt: "Fictional Atlas Workspace has confirmed project evidence.",
      },
    });

    expect((await archivePortfolioProjects(database, [project.id])).archived).toBe(1);
    const archivedState = await getOnboardingState(database);
    expect(archivedState?.portfolio).toHaveLength(0);
    expect(archivedState?.archivedPortfolio.map((item) => item.id)).toContain(project.id);
    expect(archivedState?.portfolioReadiness).toBe(0);
    const intelligence = await database.opportunityIntelligence.findMany();
    expect(JSON.stringify(intelligence)).not.toContain("Fictional Atlas Workspace");

    expect((await restorePortfolioProjects(database, [project.id])).restored).toBe(1);
    const restoredState = await getOnboardingState(database);
    expect(restoredState?.portfolio.map((item) => item.id)).toContain(project.id);
    expect(restoredState?.portfolioReadiness).toBe(80);

    expect((await removePortfolioProjects(database, [project.id])).removed).toBe(1);
    expect(await database.candidatePortfolioProject.count({
      where: { id: project.id },
    })).toBe(0);
    expect((await getOnboardingState(database))?.portfolioReadiness).toBe(0);
    expect(await database.job.count()).toBe(jobsBefore);
    expect(await database.candidateResumeEvidence.count()).toBe(resumeBefore);
    expect(await database.userDecision.count()).toBe(decisionsBefore);
  });

  it("removes multiple projects and all unstarted projects without orphaning progress", async () => {
    const database = await isolatedDatabase();
    const first = await addPortfolioProject(database, "Fictional Project One");
    const second = await addPortfolioProject(database, "Fictional Project Two");
    const third = await addPortfolioProject(database, "Fictional Project Three");
    await database.candidatePortfolioProject.update({
      where: { id: third.id },
      data: { portfolioReadiness: 60 },
    });
    await database.candidateProjectProgress.createMany({
      data: [first, second].map((project) => ({
        profileId: "primary-candidate",
        projectId: project.id,
      })),
    });

    expect((await removePortfolioProjects(database, [first.id, second.id])).removed).toBe(2);
    expect(await database.candidateProjectProgress.count({
      where: { projectId: { in: [first.id, second.id] } },
    })).toBe(0);

    const zero = await addPortfolioProject(database, "Fictional Zero Readiness");
    expect((await removeUnstartedPortfolioProjects(database)).removed).toBe(1);
    expect(await database.candidatePortfolioProject.count({
      where: { id: zero.id },
    })).toBe(0);
    expect(await database.candidatePortfolioProject.count({
      where: { id: third.id },
    })).toBe(1);
  });

  it("does not create portfolio projects from private context during profile sync", async () => {
    const database = await isolatedDatabase();
    await syncCandidateProfile(database, { force: true });
    expect(await database.candidatePortfolioProject.count({
      where: { profileId: "primary-candidate" },
    })).toBe(0);
  });

  it("keeps the zero-project onboarding path explicit", () => {
    const source = readFileSync("app/getting-started/OnboardingWizard.tsx", "utf8");
    expect(source).toContain("No portfolio projects added yet.");
    expect(source).toContain("Continue without portfolio evidence");
  });
});
