import Link from "next/link";

import { tierTone } from "@/lib/opportunity-tiers";
import {
  presentOpportunity,
  type OpportunityException,
  type OpportunityPresentation,
} from "@/lib/opportunity-presentation";
import type { GroupedOpportunity } from "@/lib/today";
import type { JobListItem } from "@/lib/view-models";
import type { OpportunityTier } from "@/lib/opportunity-tiers";

/**
 * The shared opportunity representation.
 *
 * One visual grammar, three densities. Every surface renders the same fields in
 * the same order with the same weights; what varies is how much fits.
 *
 *   compact  — scan and triage. The queue. ~84px.
 *   default  — the same row with the fit reason. Lists with room.
 *   feature  — one opportunity being recommended. Today's lead.
 *
 * The old queue row was 250px and carried sixteen text elements at four sizes,
 * six of them stacked in a right rail at near-identical weight. Three fitted a
 * 1440×900 screen, so triaging the corpus meant roughly 120 scroll positions.
 */

export type OpportunityDensity = "compact" | "default" | "feature";

function Fit({
  tier,
  score,
  claimable,
}: {
  tier: OpportunityTier;
  score: number;
  claimable: boolean;
}) {
  return (
    <span className={`opp-fit opp-fit-${claimable ? tierTone(tier) : "unmeasured"}`}>
      <b>{score}</b>
      {/* A tier is a claim about fit. Where the posting was too thin to support
          one, the number stays and the claim is withheld. */}
      <span>{claimable ? tier : "Thin evidence"}</span>
    </span>
  );
}

function Exceptions({ items }: { items: OpportunityException[] }) {
  if (!items.length) return null;
  return (
    <span className="opp-exceptions">
      {items.map((item) => (
        <span key={item.id} className={`opp-flag opp-flag-${item.tone}`} title={item.detail}>
          <i aria-hidden="true">{item.glyph}</i>
          {item.label}
        </span>
      ))}
    </span>
  );
}

export function OpportunityRow({
  job,
  density = "compact",
  headingLevel = "h3",
}: {
  job: JobListItem & { tier?: OpportunityTier };
  density?: OpportunityDensity;
  /** Rows are list items in a scannable list, so they carry real headings. */
  headingLevel?: "h2" | "h3";
}) {
  const opportunity = presentOpportunity(job);
  return <OpportunityRowView opportunity={opportunity} density={density} headingLevel={headingLevel} />;
}

export function OpportunityRowView({
  opportunity,
  density = "compact",
  headingLevel = "h3",
}: {
  opportunity: OpportunityPresentation | GroupedOpportunity;
  density?: OpportunityDensity;
  headingLevel?: "h2" | "h3";
}) {
  // A role listed several times is one opportunity with a note, not several
  // rows competing for the same attention.
  const grouped = "listings" in opportunity && opportunity.listings > 1 ? opportunity : null;
  const Heading = headingLevel;
  const blocked = opportunity.exceptions.some((item) => item.tone === "blocked");
  return (
    <article className={`opp-row opp-row-${density}${blocked ? " opp-row-blocked" : ""}`}>
      <Link className="opp-main" href={opportunity.href}>
        <span className="opp-identity">
          <Heading className="opp-title">{opportunity.title}</Heading>
          <span className="opp-company">{opportunity.company}</span>
        </span>
        <span className="opp-meta">
          {/* Facts only. Absent metadata is omitted, never announced. */}
          {opportunity.facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
          {grouped && (
            <span className="opp-grouped">
              {grouped.locations > 1
                ? `${grouped.locations} locations`
                : `${grouped.listings} listings`}
            </span>
          )}
          {opportunity.age && <span className="opp-age">{opportunity.age}</span>}
          {opportunity.status && <span className="opp-status">{opportunity.status}</span>}
        </span>
        {density !== "compact" && opportunity.reason && (
          <span className="opp-reason">{opportunity.reason}</span>
        )}
      </Link>
      <span className="opp-signals">
        <Fit tier={opportunity.tier} score={opportunity.score} claimable={opportunity.tierIsClaimable} />
        <Exceptions items={opportunity.exceptions} />
      </span>
    </article>
  );
}

/** A list wrapper, so surfaces do not each invent their own spacing. */
export function OpportunityList({ children }: { children: React.ReactNode }) {
  return <div className="opp-list">{children}</div>;
}
