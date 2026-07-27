"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const views = ["kanban", "table", "timeline", "calendar"];
const storageKey = "job-finder.application-workspace";

export function ApplicationWorkspaceControls({
  providers,
}: {
  providers: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [density, setDensity] = useState(searchParams.get("density") ?? "comfortable");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (!searchParams.get("view") && saved) {
      const state = JSON.parse(saved) as { view?: string };
      if (state.view && views.includes(state.view)) router.replace(`/applications?view=${state.view}`);
    }
  }, [router, searchParams]);

  function update(values: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    const state = { view: next.get("view") ?? "kanban", stage: next.get("stage") ?? "", provider: next.get("provider") ?? "", attention: next.get("attention") ?? "", density: next.get("density") ?? "comfortable" };
    window.localStorage.setItem(storageKey, JSON.stringify(state));
    router.push(`/applications?${next.toString()}`);
  }

  return (
    <>
      <nav className="application-view-tabs" aria-label="Application views">
        {views.map((view) => <button key={view} type="button" aria-current={(searchParams.get("view") ?? "kanban") === view ? "page" : undefined} onClick={() => update({ view })}>{view}</button>)}
      </nav>
      <div className={`application-filter-bar density-${density}`}>
        <label>Search<input defaultValue={searchParams.get("q") ?? ""} onChange={(event) => update({ q: event.target.value })} placeholder="Company or role" /></label>
        <label>Stage<select defaultValue={searchParams.get("stage") ?? ""} onChange={(event) => update({ stage: event.target.value })}><option value="">All stages</option><option>Preparing</option><option>Applied</option><option>Interviewing</option><option>Offers</option><option>Closed</option></select></label>
        <label>Attention<select defaultValue={searchParams.get("attention") ?? ""} onChange={(event) => update({ attention: event.target.value })}><option value="">All attention</option><option value="yes">Needs attention</option><option value="no">No attention</option></select></label>
        <label>Provider<select defaultValue={searchParams.get("provider") ?? ""} onChange={(event) => update({ provider: event.target.value })}><option value="">All providers</option>{providers.map((provider) => <option key={provider}>{provider}</option>)}</select></label>
        <label>Sort<select defaultValue={searchParams.get("sort") ?? "recent"} onChange={(event) => update({ sort: event.target.value })}><option value="recent">Recent activity</option><option value="company">Company</option><option value="stage">Stage</option><option value="followup">Next follow-up</option></select></label>
        <label>Density<select value={density} onChange={(event) => { setDensity(event.target.value); update({ density: event.target.value }); }}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      </div>
    </>
  );
}
