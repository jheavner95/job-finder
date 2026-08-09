import { afterEach, describe, expect, it } from "vitest";

import {
  calculateCareerReadiness,
  ensureOnboarding,
  getOnboardingState,
} from "../lib/onboarding";
import { createTestDatabase, releaseTestDatabases } from "./test-database";

afterEach(releaseTestDatabases);

describe("candidate onboarding", () => {
  it("shows Getting Started on first launch and hides it after completion", async () => {
    const database = await createTestDatabase({ label: "onboarding" });

    await database.candidateOnboarding.deleteMany({
      where: { profileId: "primary-candidate" },
    });
    const firstRun = await getOnboardingState(database);
    expect(firstRun?.shouldShowPrimary).toBe(true);

    const onboarding = await ensureOnboarding(database);
    await database.candidateOnboarding.update({
      where: { id: onboarding.id },
      data: { completedAt: new Date(), currentStep: 5, highestStep: 5 },
    });

    const returning = await getOnboardingState(database);
    expect(returning?.shouldShowPrimary).toBe(false);
  });

  it("calculates readiness only from persisted workflow inputs", () => {
    expect(calculateCareerReadiness({
      resumeRecords: 0,
      capabilityCoverage: 0,
      portfolioReadiness: 0,
      preferencesComplete: false,
    })).toBe(0);
    expect(calculateCareerReadiness({
      resumeRecords: 3,
      capabilityCoverage: 40,
      portfolioReadiness: 20,
      preferencesComplete: true,
    })).toBe(59);
  });
});
