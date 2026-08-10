"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { reassessAllLevels } from "@/lib/level-fit/service";

const CANDIDATE_ID = "primary-candidate";

/**
 * Editing a preference is not re-running setup.
 *
 * These fields were writable only through `savePreferences` in the onboarding
 * wizard, which ends by calling `setStep(5)` — so changing your target salary
 * moved you back through first-run setup. The parsing is deliberately the same
 * as the wizard's so both routes store identical shapes; only the step side
 * effect is gone.
 */

function list(formData: FormData, name: string): string[] {
  return String(formData.get(name) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function text(formData: FormData, name: string): string | null {
  return String(formData.get(name) ?? "").trim() || null;
}

function revalidateProfile() {
  revalidatePath("/context");
  // Level fit and eligibility read these, and both appear on opportunity rows.
  revalidatePath("/review");
  revalidatePath("/");
}

/** Roles and industries: what you are looking for. */
export async function saveTargetPreferences(formData: FormData) {
  const roles = list(formData, "preferredRoles");
  const industries = list(formData, "preferredIndustries");
  await prisma.candidateCareerPreferences.upsert({
    where: { profileId: CANDIDATE_ID },
    create: {
      id: "primary-career-preferences",
      profileId: CANDIDATE_ID,
      preferredRoles: roles,
      preferredIndustries: industries,
      companyExclusions: [],
      employmentTypes: [],
    },
    update: { preferredRoles: roles, preferredIndustries: industries },
  });

  /*
   * The target level is read from these role titles, and level verdicts are
   * stored per job. Saving new roles without re-deriving them would leave
   * every opportunity flagged against the old band — the same reason
   * `saveRoleTrackPreference` re-checks. Scores, tiers, eligibility and
   * discovery state are untouched.
   */
  await reassessAllLevels(prisma);
  revalidateProfile();
}

/** Work mode, employment type, pay and exclusions: how you want to work. */
export async function saveWorkPreferences(formData: FormData) {
  const employmentTypes = list(formData, "employmentTypes");
  const companyExclusions = list(formData, "companyExclusions");
  const workMode = text(formData, "workMode");
  const compensation = text(formData, "compensation");
  await prisma.candidateCareerPreferences.upsert({
    where: { profileId: CANDIDATE_ID },
    create: {
      id: "primary-career-preferences",
      profileId: CANDIDATE_ID,
      preferredRoles: [],
      preferredIndustries: [],
      workMode,
      compensation,
      companyExclusions,
      employmentTypes,
    },
    update: { workMode, compensation, companyExclusions, employmentTypes },
  });
  revalidateProfile();
}
