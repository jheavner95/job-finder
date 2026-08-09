import Link from "next/link";

import type { EligibilityAssessment, PostingConstraint } from "@/lib/eligibility/types";
import { verdictLabel, verdictTone } from "@/lib/eligibility/verdict";

/**
 * Eligibility is shown beside the fit tier, never folded into it.
 *
 * The score says how good the role is; this says whether it can be pursued.
 * A user who sees "Strong Fit" alone has no way to tell those apart, which is
 * how six roles requiring Singapore or UK work rights sat in the Strong Fit
 * band with nothing to distinguish them.
 */

export function EligibilityBadge({
  assessment,
  compact = false,
}: {
  assessment: EligibilityAssessment | null;
  compact?: boolean;
}) {
  // An unassessed job says nothing rather than implying it is clear.
  if (!assessment || assessment.verdict === "NO_CONSTRAINT_FOUND") {
    if (!assessment || !assessment.constraints.length) return null;
    if (compact) return null;
  }
  const tone = verdictTone(assessment.verdict);
  return (
    <span className={`eligibility-chip eligibility-${tone}`} title={assessment.headline}>
      <span aria-hidden="true">{glyph(assessment.verdict)}</span>
      {compact ? verdictLabel(assessment.verdict) : `Eligibility: ${verdictLabel(assessment.verdict)}`}
    </span>
  );
}

function glyph(verdict: EligibilityAssessment["verdict"]) {
  switch (verdict) {
    case "ELIGIBLE":
      return "✓";
    case "INELIGIBLE":
      return "⊘";
    case "REVIEW_REQUIRED":
      return "!";
    default:
      return "·";
  }
}

const CLASSIFICATION_LABEL: Record<PostingConstraint["classification"], string> = {
  HARD: "Stated requirement",
  LIKELY: "Probable requirement",
  AMBIGUOUS: "Unclear requirement",
  INFORMATIONAL: "Mentioned only",
};

const TYPE_LABEL: Record<PostingConstraint["type"], string> = {
  "work-authorization": "Work authorization",
  "right-to-work": "Right to work",
  citizenship: "Citizenship or nationality",
  "export-control": "Export control",
  residency: "Residency",
  "sponsorship-unavailable": "Visa sponsorship",
  "sponsorship-available": "Visa sponsorship",
};

/**
 * The full panel, shown on the opportunity page.
 *
 * Every finding carries the sentence it came from, so the user can check the
 * verdict against the posting instead of taking it on trust.
 */
export function EligibilityPanel({
  assessment,
  declared,
}: {
  assessment: EligibilityAssessment | null;
  declared: string;
}) {
  if (!assessment) {
    return (
      <section className="eligibility-panel eligibility-neutral" aria-labelledby="eligibility-title">
        <div className="eligibility-headline">
          <p className="eyebrow">Eligibility</p>
          <h2 id="eligibility-title">Not yet assessed</h2>
          <p>This opportunity was imported before eligibility checking existed.</p>
        </div>
      </section>
    );
  }

  const tone = verdictTone(assessment.verdict);
  return (
    <section
      className={`eligibility-panel eligibility-${tone}`}
      aria-labelledby="eligibility-title"
    >
      <div className="eligibility-headline">
        <p className="eyebrow">Eligibility · separate from match score</p>
        <h2 id="eligibility-title">{verdictLabel(assessment.verdict)}</h2>
        <p>{assessment.headline}</p>
      </div>

      {assessment.constraints.length > 0 && (
        <ul className="eligibility-evidence">
          {assessment.constraints.map((constraint, index) => (
            <li key={`${constraint.ruleId}-${index}`} className={`constraint-${constraint.classification.toLowerCase()}`}>
              <div className="constraint-topline">
                <strong>{TYPE_LABEL[constraint.type]}</strong>
                {constraint.jurisdictionLabel && <span className="constraint-place">{constraint.jurisdictionLabel}</span>}
                <span className="constraint-class">{CLASSIFICATION_LABEL[constraint.classification]}</span>
              </div>
              <blockquote>{constraint.evidence}</blockquote>
              <small>
                {constraint.reason} Found in the posting {constraint.field}.
              </small>
            </li>
          ))}
        </ul>
      )}

      <p className="eligibility-basis">
        <span>Checked against:</span> {declared}{" "}
        <Link href="/context#work-authorization">Update declaration →</Link>
      </p>
    </section>
  );
}
