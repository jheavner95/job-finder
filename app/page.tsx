import Link from "next/link";

import { WorkspaceLayout } from "@/app/components/PageLayout";
import { LocalGreeting } from "@/app/components/LocalGreeting";
import { OpportunityList, OpportunityRowView } from "@/app/components/OpportunityRow";
import { loadProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { COUNT_LABEL } from "@/lib/opportunity-presentation";
import { getDashboardSummary } from "@/lib/queries";
import { RECENT_WINDOW_HOURS, buildToday } from "@/lib/today";

export const dynamic = "force-dynamic";

/** "3 hours ago" for the one discovery fact worth stating. */
function since(value: Date | null): string | null {
  if (!value) return null;
  const hours = Math.floor((Date.now() - value.getTime()) / 3_600_000);
  if (hours < 1) return "in the last hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Today — the daily decision brief.
 *
 * Replaces a dashboard that opened with a greeting, five pipeline tiles (four
 * of them permanently zero), a discovery status band, two duplicate copies of
 * the same role, and a decision summary restating a count already shown twice.
 * Two opportunities were visible above the fold.
 *
 * The order here is the order of the questions: what changed, what deserves
 * attention, what to do next. Operational information — crawls, connectors,
 * providers, duplicate-prevention totals — answers none of them and is not
 * shown; it belongs to System.
 */
export default async function TodayPage() {
  const [summary, profile, lastScan] = await Promise.all([
    getDashboardSummary(),
    loadProfile(prisma),
    prisma.discoveryBatch.findFirst({
      where: { status: { not: "Running" } },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  // Anchored to request time: the product records when a posting was first
  // seen, but nothing records when the user last opened it, so "since your
  // last visit" would be a claim the data cannot support.
  const today = buildToday(summary.jobs, new Date());
  const { counts } = today;
  const lastChecked = since(lastScan?.completedAt ?? lastScan?.startedAt ?? null);
  const empty = counts.discovered === 0;
  // Same list Your Profile shows, so the two never disagree about what is
  // missing or how much of it there is.
  const profileGaps = profile.gaps.length;

  return (
    <WorkspaceLayout className="today-page">
      <header className="today-header">
        <p className="today-greeting">
          <LocalGreeting />
        </p>
        <h1>
          {empty
            ? "Nothing discovered yet."
            : counts.needsReview > 0
              ? `${COUNT_LABEL.needsReview(counts.needsReview)}.`
              : "You're all caught up."}
        </h1>
        <p className="today-state">
          {today.newCount > 0 && (
            <>
              <strong>{today.newCount} new</strong> in the last {RECENT_WINDOW_HOURS} hours
            </>
          )}
          {today.newCount > 0 && counts.worthConsidering > 0 && <span aria-hidden="true"> · </span>}
          {counts.worthConsidering > 0 && <>{COUNT_LABEL.worthConsidering(counts.worthConsidering)}</>}
          {counts.discovered > 0 && <span aria-hidden="true"> · </span>}
          {counts.discovered > 0 && <>{COUNT_LABEL.discovered(counts.discovered)}</>}
        </p>
      </header>

      {today.startHere.length > 0 && (
        <section className="today-section" aria-labelledby="today-start">
          <div className="today-section-head">
            <h2 id="today-start">Start here</h2>
            <Link className="text-button" href="/review">
              Review all <span aria-hidden="true">→</span>
            </Link>
          </div>
          <OpportunityList>
            {today.startHere.map((opportunity) => (
              <OpportunityRowView key={opportunity.id} opportunity={opportunity} density="compact" />
            ))}
          </OpportunityList>
        </section>
      )}

      {/* A quiet strip, not a card grid. Each line is a decision the user could
          act on; a line with nothing behind it is simply absent. */}
      {(today.attention.length > 0 || today.decided.applied > 0 || today.decided.saved > 0 || lastChecked) && (
        <section className="today-strip" aria-label="Other things to know">
          {today.attention.map((item) => (
            <Link key={item.id} className="today-strip-item is-action" href={item.href}>
              {item.label}
            </Link>
          ))}
          {/* Sourced from recorded decisions rather than the Application table,
              which is empty. Showing "0 applications" beside four applied
              decisions would be the product contradicting itself.
              Linked now that Opportunities filters by decision state; UX-2 left
              these as plain text because no destination could honour them.
              UX-4 owns the application lifecycle. */}
          {/* Applications owns the lifecycle, so this lands there rather than
              on the Opportunities filter UX-3 pointed it at. */}
          {today.decided.applied > 0 && (
            <Link className="today-strip-item" href="/applications">
              {COUNT_LABEL.applied(today.decided.applied)}
            </Link>
          )}
          {today.decided.saved > 0 && (
            <Link className="today-strip-item" href="/review?state=saved">
              {COUNT_LABEL.saved(today.decided.saved)}
            </Link>
          )}
          {/* Was "Profile 49% complete". UX-6 removed that percentage from the
              profile itself — it counted context documents rather than
              describing a career — and a link promising a number the
              destination no longer shows is worse than no link. This states
              the one thing the profile would actually ask you to do. */}
          {profileGaps > 0 && (
            <Link className="today-strip-item" href="/context">
              {profileGaps === 1 ? "1 profile gap" : `${profileGaps} profile gaps`}
            </Link>
          )}
          {lastChecked && (
            /* The only discovery fact that changes a daily decision: whether
               what you are looking at is current. */
            <span className="today-strip-item is-quiet">Last checked {lastChecked}</span>
          )}
        </section>
      )}

      {today.newToday.length > 0 && (
        <section className="today-section" aria-labelledby="today-new">
          <div className="today-section-head">
            <h2 id="today-new">Also new today</h2>
            <Link className="text-button" href="/review">
              View opportunities <span aria-hidden="true">→</span>
            </Link>
          </div>
          <OpportunityList>
            {today.newToday.map((opportunity) => (
              <OpportunityRowView key={opportunity.id} opportunity={opportunity} density="compact" />
            ))}
          </OpportunityList>
        </section>
      )}

      {empty && (
        <section className="today-section">
          <p className="today-quiet">
            No opportunities have been discovered yet.{" "}
            <Link href="/scan">Run a scan</Link> to start finding roles.
          </p>
        </section>
      )}

      {!empty && counts.needsReview === 0 && (
        <section className="today-section">
          <p className="today-quiet">
            Nothing is waiting on a decision. <Link href="/review">Browse everything found</Link>.
          </p>
        </section>
      )}
    </WorkspaceLayout>
  );
}
