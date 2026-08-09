import { jurisdictionByCode } from "./jurisdictions";
import type { CandidateEligibilityFacts } from "./types";

/**
 * Candidate eligibility facts are declared, never derived.
 *
 * Nothing here reads a résumé, an email address, a past employer's location, or
 * the locations of jobs the candidate saved. Work authorization and immigration
 * status are not inferable from any of those, and a wrong inference here would
 * either hide a real opportunity or wave through one the candidate cannot take.
 */

export function emptyFacts(): CandidateEligibilityFacts | null {
  return null;
}

/** Parse the persisted JSON blob, tolerating anything that is not our shape. */
export function parseCandidateFacts(value: unknown): CandidateEligibilityFacts | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const codes = Array.isArray(record.authorizedCountries)
    ? record.authorizedCountries
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toUpperCase())
        .filter((item) => jurisdictionByCode(item) !== null)
    : [];
  const authorizedCountries = [...new Set(codes)].sort();
  // A "complete" declaration with nothing in it would silently exclude every
  // constrained role, so completeness only counts when something was declared.
  const declarationComplete =
    record.declarationComplete === true && authorizedCountries.length > 0;
  if (!authorizedCountries.length) return null;
  return {
    version: 1,
    authorizedCountries,
    declarationComplete,
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Build facts from user input.
 *
 * `countries` arrives as free text from the declaration field ("US, UK"), so
 * unknown tokens are dropped rather than guessed at.
 */
export function buildCandidateFacts(
  countries: string[],
  declarationComplete: boolean,
  now: Date,
): CandidateEligibilityFacts | null {
  const resolved = [
    ...new Set(
      countries
        .map((item) => item.trim().toUpperCase())
        .filter((item) => jurisdictionByCode(item) !== null),
    ),
  ].sort();
  if (!resolved.length) return null;
  return {
    version: 1,
    authorizedCountries: resolved,
    declarationComplete: declarationComplete && resolved.length > 0,
    updatedAt: now.toISOString(),
  };
}

export function describeFacts(facts: CandidateEligibilityFacts | null): string {
  if (!facts) return "No work authorization has been declared.";
  const labels = facts.authorizedCountries
    .map((code) => jurisdictionByCode(code)?.label ?? code)
    .join(", ");
  return facts.declarationComplete
    ? `Authorized to work in ${labels}, and this list is complete.`
    : `Authorized to work in ${labels}. Other countries are unconfirmed.`;
}
