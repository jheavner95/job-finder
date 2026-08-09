import { jurisdictionByCode } from "./jurisdictions";
import { DETECTOR_VERSION } from "./posting-constraints";
import type {
  CandidateEligibilityFacts,
  EligibilityAssessment,
  EligibilityVerdict,
  PostingConstraint,
} from "./types";

/**
 * Turn posting constraints into a verdict for one candidate.
 *
 * The rule the whole layer rests on: absence of candidate evidence produces
 * REVIEW_REQUIRED, never INELIGIBLE. Being unable to confirm someone may take a
 * job is not the same as knowing they may not, and only one of those two
 * mistakes costs the user an opportunity they were entitled to.
 */

/** Sponsorship statements describe the employer, not a bar on the candidate. */
function isIndependentRequirement(constraint: PostingConstraint) {
  return (
    constraint.type !== "sponsorship-available" &&
    constraint.type !== "sponsorship-unavailable" &&
    constraint.classification !== "INFORMATIONAL"
  );
}

export function assessEligibility(
  constraints: PostingConstraint[],
  facts: CandidateEligibilityFacts | null,
): EligibilityAssessment {
  const requirements = constraints.filter(isIndependentRequirement);
  const sponsorshipRefused = constraints.some(
    (item) => item.type === "sponsorship-unavailable" && item.classification !== "INFORMATIONAL",
  );

  const base = {
    constraints,
    detectorVersion: DETECTOR_VERSION,
    candidateFactsUpdatedAt: facts?.updatedAt ?? null,
  };

  if (!requirements.length) {
    // A refusal to sponsor bars nobody who is already authorized, but the user
    // still needs to see it — it is the difference between a role they can take
    // today and one they never could.
    const note = sponsorshipRefused
      ? "No eligibility requirement was stated. Note: this employer does not offer visa sponsorship."
      : constraints.length
        ? "No eligibility requirement for you. The posting mentions eligibility only in standard notices."
        : "No eligibility requirement was found in this posting.";
    return { ...base, verdict: "NO_CONSTRAINT_FOUND", headline: note, blocking: [], unresolved: [] };
  }

  if (!facts) {
    return {
      ...base,
      verdict: "REVIEW_REQUIRED",
      headline: `${summarize(requirements)} Your work authorization has not been declared, so this cannot be checked.`,
      blocking: [],
      unresolved: requirements,
    };
  }

  const blocking: PostingConstraint[] = [];
  const unresolved: PostingConstraint[] = [];

  for (const constraint of requirements) {
    // No jurisdiction to compare against, or a supranational one: the user has
    // to read it. A bloc never produces an exclusion, because authorization in
    // one member state can carry across the bloc.
    if (!constraint.jurisdiction || constraint.jurisdictionIsBloc) {
      unresolved.push(constraint);
      continue;
    }

    const authorized = facts.authorizedCountries.includes(constraint.jurisdiction);

    if (authorized) {
      // Being authorized to work somewhere is not the same as holding the
      // national status export-control rules require, so this never clears.
      if (constraint.type === "export-control") unresolved.push(constraint);
      continue;
    }

    if (!facts.declarationComplete) {
      unresolved.push(constraint);
      continue;
    }

    // Sponsorship being refused turns a soft requirement into a hard one: there
    // is no route from "not authorized" to "authorized" for this employer.
    const effective =
      constraint.classification === "HARD" || sponsorshipRefused ? "HARD" : constraint.classification;

    if (effective === "HARD") blocking.push(constraint);
    else unresolved.push(constraint);
  }

  const verdict: EligibilityVerdict = blocking.length
    ? "INELIGIBLE"
    : unresolved.length
      ? "REVIEW_REQUIRED"
      : "ELIGIBLE";

  return {
    ...base,
    verdict,
    headline: headlineFor(verdict, blocking, unresolved, requirements),
    blocking,
    unresolved,
  };
}

function label(constraint: PostingConstraint) {
  const where = constraint.jurisdictionLabel
    ? ` in ${constraint.jurisdictionLabel}`
    : "";
  switch (constraint.type) {
    case "work-authorization":
      return `work authorization${where} required`;
    case "right-to-work":
      return `right to work${where} required`;
    case "citizenship":
      return `citizenship or nationality${where ? ` of ${constraint.jurisdictionLabel}` : ""} required`;
    case "export-control":
      return `export-control status${where ? ` (${constraint.jurisdictionLabel} person)` : ""} required`;
    case "residency":
      return `residence${where} required`;
    default:
      return "eligibility requirement stated";
  }
}

function summarize(constraints: PostingConstraint[]) {
  const unique = [...new Set(constraints.map(label))];
  const text = unique.slice(0, 2).join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

function headlineFor(
  verdict: EligibilityVerdict,
  blocking: PostingConstraint[],
  unresolved: PostingConstraint[],
  requirements: PostingConstraint[],
) {
  if (verdict === "INELIGIBLE") return `${summarize(blocking)} Your declared authorization does not cover it.`;
  if (verdict === "REVIEW_REQUIRED") return `${summarize(unresolved)} Confirm this before applying.`;
  return `${summarize(requirements)} Your declared authorization covers it.`;
}

/** Presentation-safe short label, used on list rows. */
export function verdictLabel(verdict: EligibilityVerdict): string {
  switch (verdict) {
    case "ELIGIBLE":
      return "Eligible";
    case "INELIGIBLE":
      return "Ineligible";
    case "REVIEW_REQUIRED":
      return "Review required";
    default:
      return "No constraint found";
  }
}

export function verdictTone(verdict: EligibilityVerdict): "clear" | "warning" | "blocked" | "neutral" {
  switch (verdict) {
    case "ELIGIBLE":
      return "clear";
    case "INELIGIBLE":
      return "blocked";
    case "REVIEW_REQUIRED":
      return "warning";
    default:
      return "neutral";
  }
}

export function jurisdictionLabel(code: string) {
  return jurisdictionByCode(code)?.label ?? code;
}
