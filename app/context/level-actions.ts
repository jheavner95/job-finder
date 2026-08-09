"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { parseTrackPreference } from "@/lib/level-fit";
import { reassessAllLevels } from "@/lib/level-fit/service";

/**
 * Record the candidate's IC / management intent.
 *
 * An empty submission clears the preference, which returns every track verdict
 * to silence rather than leaving a stale mismatch flag in place.
 */
export async function saveRoleTrackPreference(formData: FormData) {
  const track = parseTrackPreference(String(formData.get("trackPreference") ?? ""));

  await prisma.candidateCareerPreferences.update({
    where: { profileId: "primary-candidate" },
    data: { trackPreference: track },
  });

  // Verdicts depend on the preference, so every job is re-derived. Scores,
  // tiers, eligibility and discovery state are untouched.
  await reassessAllLevels(prisma);

  revalidatePath("/context");
  revalidatePath("/review");
  revalidatePath("/");
}
