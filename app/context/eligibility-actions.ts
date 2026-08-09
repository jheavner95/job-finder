"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { buildCandidateFacts } from "@/lib/eligibility";
import { CANDIDATE_PROFILE_ID, reassessAllJobs } from "@/lib/eligibility/service";

/**
 * Record the candidate's declared work authorization.
 *
 * This is the only writer of eligibility facts. Nothing else in the codebase
 * may set them — an inferred authorization would either hide a role the
 * candidate could take or clear one they could not.
 */
export async function saveEligibilityDeclaration(formData: FormData) {
  const countries = String(formData.get("authorizedCountries") ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const complete = formData.get("declarationComplete") === "on";

  const facts = buildCandidateFacts(countries, complete, new Date());

  await prisma.candidateProfile.update({
    where: { id: CANDIDATE_PROFILE_ID },
    // Clearing the field is a supported action: it returns every verdict to
    // "review required" rather than leaving stale exclusions in place.
    data: { eligibilityFacts: facts ?? Prisma.DbNull },
  });

  // Verdicts depend on the declaration, so every job is re-derived. Scores,
  // tiers and discovery state are untouched.
  await reassessAllJobs(prisma);

  revalidatePath("/context");
  revalidatePath("/review");
  revalidatePath("/");
}
