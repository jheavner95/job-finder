import Link from "next/link";

import { WorkspaceLayout } from "@/app/components/PageLayout";
import { PageHeader } from "@/app/components/PageHeader";
import {
  APPLICATION_STATES,
  APPLICATION_STATE_LABEL,
  STALE_AFTER_DAYS,
  buildApplications,
  sinceLabel,
  type ApplicationState,
  type DerivedApplication,
} from "@/lib/applications";
import { getJobs } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = { state?: string };

/**
 * Applications — what happened after you decided to pursue something.
 *
 * Replaces a page headed "Your application CRM" that opened with six metrics
 * reading zero, four view tabs (kanban, table, timeline, calendar), six filter
 * controls, and then "No applications yet" — while the user had four applied
 * decisions recorded and Today was reporting them.
 *
 * Every row here is derived from a decision the user actually made. Nothing on
 * this page can exist without one, so nothing on it can be zero-but-present.
 */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const now = new Date();
  const model = buildApplications(await getJobs(), now);

  /*
   * Segments earn their place by holding something.
   *
   * "Offers 0" is not navigation, it is a reminder that you have no offers.
   * Active and Closed are the two questions worth a permanent answer; the
   * individual states appear only once the history contains them.
   */
  const activeStates = APPLICATION_STATES.filter(
    (state) => state !== "closed" && model.stateCounts[state] > 0,
  );
  const segments: { key: string; label: string; count: number; rows: DerivedApplication[] }[] = [
    { key: "active", label: "Active", count: model.active.length, rows: model.active },
    // A state filter that selects every active application is not a filter.
    // With four applications all sitting at Applied, "Active 4 · Applied 4"
    // offered a choice between a list and the same list.
    ...(activeStates.length > 1
      ? activeStates.map((state) => ({
          key: state,
          label: APPLICATION_STATE_LABEL[state],
          count: model.stateCounts[state],
          rows: model.all.filter((application) => application.state === state),
        }))
      : []),
    ...(model.closed.length > 0
      ? [{ key: "closed", label: "Closed", count: model.closed.length, rows: model.closed }]
      : []),
  ];

  const requested = segments.find((segment) => segment.key === params.state);
  const selected = requested ?? segments[0];
  const rows = selected?.rows ?? [];
  /*
   * Same rule as Opportunities: a filter that cannot be honoured says so.
   * `?state=closed` with nothing closed used to render the active list, which
   * looks like a filter quietly disagreeing with you.
   */
  const rejected = params.state && !requested ? params.state : null;

  if (model.all.length === 0) {
    return (
      <WorkspaceLayout className="applications-page">
        <PageHeader title="Applications" subtitle="What happened after you decided to pursue a role." />
        {/* One line, not a panel with an icon and a headline. */}
        <p className="app-none">
          You haven&apos;t applied to anything yet. <Link href="/review">Review opportunities</Link> and
          mark one applied when you do.
        </p>
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout className="applications-page">
      <PageHeader title="Applications" subtitle="What happened after you decided to pursue a role." />

      {/* A single tab is a label pretending to be navigation. */}
      {segments.length > 1 && (
      <nav className="app-states" aria-label="Filter applications">
        {segments.map((segment) => (
          <Link
            key={segment.key}
            href={segment.key === segments[0].key ? "/applications" : `/applications?state=${segment.key}`}
            aria-current={segment.key === selected?.key ? "page" : undefined}
            className={segment.key === selected?.key ? "is-selected" : undefined}
          >
            {segment.label}
            <span>{segment.count}</span>
          </Link>
        ))}
      </nav>
      )}

      {rejected && (
        <p className="app-rejected" role="status">
          {!APPLICATION_STATES.includes(rejected as never)
            ? `Ignored an unrecognised filter: state=${rejected}.`
            : rejected === "closed"
              ? `Nothing has closed yet. Showing ${selected.label.toLowerCase()} instead.`
              : `Nothing is at ${APPLICATION_STATE_LABEL[rejected as ApplicationState]}. Showing ${selected.label.toLowerCase()} instead.`}
        </p>
      )}

      {/* Only when something is actually going stale. No counter at zero. */}
      {model.stale.length > 0 && selected?.key === "active" && (
        <p className="app-stale" role="status">
          {model.stale.length === 1
            ? `1 application has had no update in over ${STALE_AFTER_DAYS} days.`
            : `${model.stale.length} applications have had no update in over ${STALE_AFTER_DAYS} days.`}
        </p>
      )}

      {/*
       * Insights, offered only once it can say something.
       *
       * It was a primary navigation item reporting "Not enough historical data
       * yet" for every metric it owns; its own threshold is five applications.
       * Below that it is not a destination, so it is not offered.
       */}
      {model.all.length >= 5 && (
        <p className="app-insights-link">
          <Link href="/insights">Patterns across your applications</Link>
        </p>
      )}

      <h2 className="app-result-line">
        {rows.length} {rows.length === 1 ? "application" : "applications"}
        {selected && selected.key !== "active" && <span> · {selected.label.toLowerCase()}</span>}
      </h2>

      <ul className="app-list">
        {rows.map((application) => (
          <li key={application.jobId}>
            <ApplicationRow application={application} now={now} />
          </li>
        ))}
      </ul>
    </WorkspaceLayout>
  );
}

/**
 * One row, one application.
 *
 * State first, because after applying that is the only thing that has changed.
 * Fit is deliberately absent: the tier decided whether to apply, and repeating
 * it here would be scoring a decision already made.
 */
function ApplicationRow({ application, now }: { application: DerivedApplication; now: Date }) {
  const stale = application.active && application.daysSinceActivity >= STALE_AFTER_DAYS;
  return (
    <article className="app-row">
      <Link className="app-main" href={application.href}>
        <span className="app-identity">
          <h3 className="app-role">{application.role}</h3>
          <span className="app-company">{application.company}</span>
        </span>
        <span className="app-meta">
          {application.facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </span>
      </Link>
      <span className="app-status">
        <span className={`app-state app-state-${application.state}`}>
          {application.outcome ?? APPLICATION_STATE_LABEL[application.state]}
        </span>
        <span className="app-when">
          {application.state === "applied"
            ? `Applied ${sinceLabel(application.appliedAt, now)}`
            : `Updated ${sinceLabel(application.lastActivityAt, now)}`}
          {stale && <b> · no update</b>}
        </span>
      </span>
    </article>
  );
}
