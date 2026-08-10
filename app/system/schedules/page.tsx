import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { SubmitButton } from "@/app/components/SubmitButton";
import { prisma } from "@/lib/db";
import { SCHEDULE_TYPES, scheduleLabel } from "@/lib/scheduling/schedule";

import { updateSavedSearchAction } from "./actions";

export const dynamic = "force-dynamic";

function criteria(value: unknown) {
  const data = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    titles: Array.isArray(data.titles) ? data.titles.filter((item): item is string => typeof item === "string") : [],
    locations: Array.isArray(data.locations) ? data.locations.filter((item): item is string => typeof item === "string") : [],
    remote: data.remote !== false,
    hybrid: data.hybrid !== false,
  };
}

/**
 * Schedules — when Job Finder checks each company, and what it looks for.
 *
 * This was "Saved Searches" in the sidebar, which promised user-authored search
 * queries and delivered 403 per-company crawl configuration forms across
 * 159,708px — 177 screens. Its own subtitle admitted it: "Edit search criteria
 * and schedules for each company source." The name is gone; the capability is
 * unchanged, searched and paged rather than scrolled.
 */
export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; q?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const all = await prisma.companyConnector.findMany({
    include: { schedule: true },
    orderBy: { company: "asc" },
  });
  const query = (params.q ?? "").trim();
  const matching = query
    ? all.filter((connector) => connector.company.toLowerCase().includes(query.toLowerCase()))
    : all;
  const pageSize = Number(params.limit) > 0 ? Math.min(Number(params.limit), 500) : 10;
  const connectors = matching.slice(0, pageSize);

  return (
    <WorkspaceLayout className="searches-page">
      <PageHeader
        title="Schedules"
        subtitle="When Job Finder checks each company, and which roles it looks for."
      />
      <div className="companies-controls">
        <p className="companies-summary">
          <strong>{matching.length.toLocaleString()}</strong>
          {query ? <> matching &ldquo;{query}&rdquo;</> : <> companies configured</>}
          {query && <> · <Link href="/system/schedules">Clear</Link></>}
        </p>
        <form className="companies-search" action="/system/schedules">
          <label className="sr-only" htmlFor="schedules-q">Search companies</label>
          <input id="schedules-q" name="q" defaultValue={query} placeholder="Search companies" />
          <button type="submit">Search</button>
        </form>
      </div>
      {params.saved && <div className="crawl-result" role="status"><strong>Schedule updated.</strong></div>}
      {params.error && <div className="crawl-result crawl-error" role="alert"><strong>Review the role and schedule values.</strong></div>}

      <div className="saved-search-list">
        {connectors.map((connector) => {
          const search = criteria(connector.searchCriteria);
          return (
            <form action={updateSavedSearchAction} className="saved-search-card" key={connector.id}>
              <input type="hidden" name="connectorId" value={connector.id} />
              <header>
                <div><p className="eyebrow">{connector.atsType}</p><h2>{connector.company}</h2></div>
                <span>{scheduleLabel(connector.schedule)}</span>
              </header>
              <div className="search-fields">
                <label>Roles<textarea name="titles" rows={4} defaultValue={search.titles.join("\n")} placeholder="One role per line" /></label>
                <label>Locations<textarea name="locations" rows={4} defaultValue={search.locations.join("\n")} placeholder="One location per line" /></label>
                <fieldset>
                  <legend>Work model</legend>
                  <label><input type="checkbox" name="remote" defaultChecked={search.remote} /> Remote</label>
                  <label><input type="checkbox" name="hybrid" defaultChecked={search.hybrid} /> Hybrid</label>
                </fieldset>
                <fieldset>
                  <legend>Company source</legend>
                  <label><input type="checkbox" name="enabled" defaultChecked={connector.enabled} /> Enabled</label>
                </fieldset>
              </div>
              <div className="schedule-fields">
                <label>Execution schedule<select name="scheduleType" defaultValue={connector.schedule?.scheduleType ?? "Manual"}>{SCHEDULE_TYPES.map((type) => <option value={type} key={type}>{type === "Interval" ? "Custom interval" : type}</option>)}</select></label>
                <label>Time<input name="timeOfDay" type="time" defaultValue={connector.schedule?.timeOfDay ?? "08:00"} /></label>
                <label>Weekly day<select name="weekday" defaultValue={connector.schedule?.weekday ?? 1}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label>
                <label>Interval minutes<input name="intervalMinutes" type="number" min="5" max="43200" defaultValue={connector.schedule?.intervalMinutes ?? 60} /></label>
                <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
              </div>
            </form>
          );
        })}
        {!connectors.length && (
          <p className="companies-none">
            {query ? `No company matching “${query}”.` : "No companies are configured yet."}{" "}
            <Link href="/sources">Add one on Companies</Link>.
          </p>
        )}
      </div>
      {matching.length > connectors.length && (
        <p className="companies-more">
          <Link
            className="secondary-button button-link"
            href={`/system/schedules?${new URLSearchParams({
              ...(query ? { q: query } : {}),
              limit: String(pageSize + 10),
            })}`}
          >
            Show {Math.min(matching.length - connectors.length, 10)} more
          </Link>
          <span>Showing {connectors.length} of {matching.length.toLocaleString()}</span>
        </p>
      )}
    </WorkspaceLayout>
  );
}
