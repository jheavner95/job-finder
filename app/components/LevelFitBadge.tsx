import { LEVEL_LABEL, TRACK_LABEL } from "@/lib/level-fit/ladder";
import type { LevelFitAssessment } from "@/lib/level-fit/types";
import { levelVerdictLabel, levelVerdictTone } from "@/lib/level-fit/verdict";

/**
 * Level fit is shown next to the tier and the eligibility chip, never merged
 * into either.
 *
 * The disagreement is the point. "Strong Fit · Too junior" tells the user
 * something neither number could: the legacy score rates the craft match highly
 * while the role sits below their career level. Reconciling the two labels
 * would destroy exactly the evidence that makes the pairing useful.
 */

export function LevelFitBadge({
  assessment,
  compact = false,
}: {
  assessment: LevelFitAssessment | null;
  compact?: boolean;
}) {
  if (!assessment) return null;
  // An unassessable posting says nothing rather than filling the row with noise.
  if (compact && (assessment.verdict === "UNKNOWN" || assessment.verdict === "COMPATIBLE")) {
    return null;
  }
  const tone = levelVerdictTone(assessment.verdict);
  return (
    <span className={`level-chip level-${tone}`} title={assessment.headline}>
      <span aria-hidden="true">{glyph(assessment.verdict)}</span>
      {compact ? levelVerdictLabel(assessment.verdict) : `Level fit: ${levelVerdictLabel(assessment.verdict)}`}
    </span>
  );
}

function glyph(verdict: LevelFitAssessment["verdict"]) {
  switch (verdict) {
    case "IDEAL":
      return "✓";
    case "TOO_JUNIOR":
      return "↓";
    case "TOO_SENIOR":
      return "↑";
    case "TRACK_MISMATCH":
      return "⇄";
    case "STRETCH":
      return "↗";
    case "REVIEW_REQUIRED":
      return "!";
    default:
      return "·";
  }
}

const SOURCE_LABEL: Record<string, string> = {
  title: "Title",
  "years-of-experience": "Stated experience",
  responsibilities: "Responsibilities",
  profile: "Your profile",
};

export function LevelFitPanel({
  assessment,
  candidateSummary,
}: {
  assessment: LevelFitAssessment | null;
  candidateSummary: string;
}) {
  if (!assessment) {
    return (
      <section className="level-panel level-neutral" aria-labelledby="level-fit-title">
        <div className="level-headline">
          <p className="eyebrow">Level fit</p>
          <h2 id="level-fit-title">Not yet assessed</h2>
          <p>This opportunity was imported before level checking existed.</p>
        </div>
      </section>
    );
  }

  const { posting } = assessment;
  const tone = levelVerdictTone(assessment.verdict);
  return (
    <section className={`level-panel level-${tone}`} aria-labelledby="level-fit-title">
      <div className="level-headline">
        <p className="eyebrow">Level fit · separate from match score</p>
        <h2 id="level-fit-title">{levelVerdictLabel(assessment.verdict)}</h2>
        <p>{assessment.headline}</p>
      </div>

      <dl className="level-facts">
        <div>
          <dt>Posting level</dt>
          <dd>{LEVEL_LABEL[posting.level]}</dd>
        </div>
        <div>
          <dt>Track</dt>
          <dd>{TRACK_LABEL[posting.track]}</dd>
        </div>
        <div>
          <dt>Experience asked for</dt>
          <dd>
            {posting.yearsRequiredMin === null
              ? "Not stated"
              : posting.yearsRequiredMax !== null
                ? `${posting.yearsRequiredMin}–${posting.yearsRequiredMax} years`
                : `${posting.yearsRequiredMin}+ years`}
          </dd>
        </div>
      </dl>

      {posting.evidence.length > 0 && (
        <ul className="level-evidence">
          {posting.evidence.map((item, index) => (
            <li key={`${item.source}-${index}`}>
              <span className="level-evidence-source">{SOURCE_LABEL[item.source] ?? item.source}</span>
              <q>{item.text}</q>
              <small>{item.signal}</small>
            </li>
          ))}
        </ul>
      )}

      <p className="level-basis">
        <span>Compared against:</span> {candidateSummary}
      </p>
    </section>
  );
}
