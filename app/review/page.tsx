import Link from "next/link";

import { OpportunityList, OpportunityRowView } from "@/app/components/OpportunityRow";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { PageHeader } from "@/app/components/PageHeader";
import {
  DECISION_LABEL,
  DECISION_STATES,
  REFINEMENTS,
  buildOpportunities,
  parseOpportunityQuery,
  refinementLabel,
  SORTS,
  SORT_LABEL,
  type DecisionState,
  type Refinement,
  type Sort,
} from "@/lib/opportunities";
import { getJobs } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = {
  state?: string;
  refine?: string;
  q?: string;
  sort?: string;
  show?: string;
};

/** Preserve the rest of the query when one control changes. */
function href(current: Params, change: Partial<Params>): string {
  const next = new URLSearchParams();
  const merged = { ...current, ...change };
  for (const [key, value] of Object.entries(merged)) {
    // `show` resets whenever the result set changes; paging into a different
    // list is meaningless.
    if (key === "show" && change.show === undefined && Object.keys(change).length) continue;
    if (value) next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `/review?${query}` : "/review";
}

/**
 * Opportunities — the comprehensive working set.
 *
 * Today curates the morning's five. This is everything: browse it, narrow it,
 * open one. It does not prioritise a second time and it does not know what a
 * provider is.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const query = parseOpportunityQuery(params);
  const jobs = await getJobs();
  const workspace = buildOpportunities(jobs, query);

  const base: Params = {
    state: query.state,
    refine: query.refine === "any" ? undefined : query.refine,
    q: query.q || undefined,
    sort: query.sort === "fit" ? undefined : query.sort,
  };

  // Only offer a lens that would return something. A zero-count filter is a
  // dead end dressed as a choice.
  const availableRefinements = REFINEMENTS.filter(
    (refinement) => refinement === query.refine || (workspace.refinementCounts[refinement] ?? 0) > 0,
  );

  return (
    <WorkspaceLayout className="opportunities-page">
      <PageHeader
        title="Opportunities"
        subtitle="Everything Job Finder has found, ranked against your career profile."
      />

      <div className="opp-controls">
        <nav className="opp-states" aria-label="Filter by your decision">
          {DECISION_STATES.map((state) => (
            <Link
              key={state}
              href={href(base, { state, show: undefined })}
              aria-current={state === query.state ? "page" : undefined}
              className={state === query.state ? "is-selected" : undefined}
            >
              {DECISION_LABEL[state]}
              <span>{workspace.stateCounts[state]}</span>
            </Link>
          ))}
        </nav>

        <form className="opp-search" action="/review">
          <input type="hidden" name="state" value={query.state} />
          {query.refine !== "any" && <input type="hidden" name="refine" value={query.refine} />}
          {query.sort !== "fit" && <input type="hidden" name="sort" value={query.sort} />}
          <label className="sr-only" htmlFor="opp-q">
            Search opportunities
          </label>
          <input id="opp-q" name="q" defaultValue={query.q} placeholder="Search role, company, location" />
          <button type="submit">Search</button>
        </form>
      </div>

      <div className="opp-refine">
        <span className="opp-refine-group" role="group" aria-label="Narrow by fit or flag">
          {availableRefinements.map((refinement) => (
            <Link
              key={refinement}
              href={href(base, { refine: refinement === "any" ? undefined : refinement, show: undefined })}
              aria-current={refinement === query.refine ? "true" : undefined}
              className={refinement === query.refine ? "is-selected" : undefined}
            >
              {refinementLabel(refinement as Refinement)}
              <span>{workspace.refinementCounts[refinement] ?? 0}</span>
            </Link>
          ))}
        </span>
        <span className="opp-sort">
          Sort
          {SORTS.map((sort) => (
            <Link
              key={sort}
              href={href(base, { sort: sort === "fit" ? undefined : sort, show: undefined })}
              aria-current={sort === query.sort ? "true" : undefined}
              className={sort === query.sort ? "is-selected" : undefined}
            >
              {SORT_LABEL[sort as Sort]}
            </Link>
          ))}
        </span>
      </div>

      {query.rejected.length > 0 && (
        /* Say so rather than quietly showing something else. */
        <p className="opp-rejected" role="status">
          Ignored an unrecognised filter: {query.rejected.join(", ")}.
        </p>
      )}

      {/* The list's name, not decoration: it says what the rows below are, so
          it carries the heading and their h3s sit under something. */}
      <h2 className="opp-result-line" aria-live="polite">
        <strong>
          {workspace.matched.toLocaleString()}{" "}
          {workspace.matched === 1 ? "opportunity" : "opportunities"}
        </strong>
        {workspace.postings > workspace.matched && (
          <span> across {workspace.postings.toLocaleString()} listings</span>
        )}
        {query.q && <span> matching “{query.q}”</span>}
        {(query.q || query.refine !== "any" || query.state !== "to-review") && (
          <Link className="opp-clear" href="/review">
            Clear filters
          </Link>
        )}
      </h2>

      {workspace.visible.length > 0 ? (
        <>
          <OpportunityList>
            {workspace.visible.map((opportunity) => (
              <OpportunityRowView key={opportunity.id} opportunity={opportunity} density="compact" />
            ))}
          </OpportunityList>
          {workspace.hasMore && (
            <p className="opp-more">
              <Link
                className="secondary-button button-link"
                href={href({ ...base, show: String(workspace.nextShow) }, { show: String(workspace.nextShow) })}
              >
                Show {Math.min(workspace.matched - query.show, 50)} more
              </Link>
              <span>
                Showing {workspace.visible.length} of {workspace.matched.toLocaleString()}
              </span>
            </p>
          )}
        </>
      ) : (
        /* One line and a way out, not a panel. */
        <p className="opp-none">
          {query.q
            ? `Nothing matches “${query.q}” in ${DECISION_LABEL[query.state as DecisionState].toLowerCase()}.`
            : query.refine !== "any"
              ? `No ${DECISION_LABEL[query.state as DecisionState].toLowerCase()} opportunities are ${refinementLabel(query.refine).toLowerCase()}.`
              : query.state === "to-review"
                ? "Nothing is waiting on a decision."
                : `Nothing here yet.`}{" "}
          <Link href="/review">See everything to review</Link>.
        </p>
      )}
    </WorkspaceLayout>
  );
}
