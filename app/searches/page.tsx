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

export default async function SavedSearchesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const connectors = await prisma.companyConnector.findMany({
    include: { schedule: true },
    orderBy: { company: "asc" },
  });

  return (
    <WorkspaceLayout className="searches-page">
      <PageHeader
        title="Saved searches"
        subtitle="Edit search criteria and schedules for each company source."
      />
      {params.saved && <div className="crawl-result" role="status"><strong>Saved search updated.</strong></div>}
      {params.error && <div className="crawl-result crawl-error" role="alert"><strong>Review the search and schedule values.</strong></div>}

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
                <SubmitButton pendingLabel="Saving search…">Save search</SubmitButton>
              </div>
            </form>
          );
        })}
        {!connectors.length && <div className="briefing-empty"><strong>No saved searches yet.</strong><p>Add a company source to create one.</p></div>}
      </div>
    </WorkspaceLayout>
  );
}
