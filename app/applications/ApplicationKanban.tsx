"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  applicationBucket,
  defaultStageForBucket,
  interviewStages,
  validApplicationTransition,
} from "@/lib/application-intelligence";
import { updateApplicationStatusAction } from "./actions";

export type KanbanApplication = {
  id: string;
  company: string;
  role: string;
  status: string;
  appliedLabel: string;
  daysInStage: number;
  nextFollowUp: string | null;
  nextInterview: string | null;
  recentActivity: string | null;
  provider: string | null;
  attention: Array<{ type: string; label: string; level: string }>;
};

const buckets = ["Preparing", "Applied", "Interviewing", "Offers", "Closed"];

export function ApplicationKanban({ applications }: { applications: KanbanApplication[] }) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  function chooseStage(application: KanbanApplication, bucket: string) {
    if (bucket === "Interviewing") {
      const options = interviewStages();
      const value = window.prompt(`Select interview stage:\n${options.join("\n")}`, options[0]);
      return value && options.includes(value as (typeof options)[number]) ? value : null;
    }
    if (bucket === "Closed") {
      const value = window.prompt("Select outcome: Rejected, Withdrawn, Declined, Accepted, or Closed", "Rejected");
      if (!value || !["Rejected", "Withdrawn", "Declined", "Accepted", "Closed"].includes(value)) return null;
      if (!window.confirm(`Move ${application.company} — ${application.role} to ${value}? This records a terminal outcome.`)) return null;
      return value;
    }
    return defaultStageForBucket(bucket);
  }

  function move(application: KanbanApplication, bucket: string) {
    const stage = chooseStage(application, bucket);
    if (!stage || !validApplicationTransition(application.status, stage)) {
      setAnnouncement(`Move blocked. ${application.status} cannot move to ${bucket}.`);
      return;
    }
    const formData = new FormData();
    formData.set("applicationId", application.id);
    formData.set("status", stage);
    if (bucket === "Closed") {
      formData.set("confirmTerminal", "true");
      formData.set("outcomeDate", new Date().toISOString());
    }
    startTransition(async () => {
      setAnnouncement(`Moving ${application.company} to ${stage}.`);
      await updateApplicationStatusAction(formData);
    });
  }

  function adjacent(application: KanbanApplication, direction: -1 | 1) {
    const index = buckets.indexOf(applicationBucket(application.status));
    const target = buckets[index + direction];
    if (target) move(application, target);
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <div className={`application-kanban ${pending ? "kanban-pending" : ""}`}>
        {buckets.map((bucket) => {
          const items = applications.filter((item) => applicationBucket(item.status) === bucket);
          return (
            <section
              key={bucket}
              className={dropTarget === bucket ? "kanban-drop-target" : ""}
              aria-labelledby={`bucket-${bucket.toLowerCase()}`}
              onDragOver={(event) => { event.preventDefault(); setDropTarget(bucket); }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(event) => {
                event.preventDefault();
                const application = applications.find((item) => item.id === dragged);
                setDropTarget(null);
                if (application) move(application, bucket);
              }}
            >
              <header><h2 id={`bucket-${bucket.toLowerCase()}`}>{bucket}</h2><span>{items.length}</span></header>
              <div>
                {items.map((application) => (
                  <article
                    className="application-kanban-card operational-card"
                    draggable
                    onDragStart={() => setDragged(application.id)}
                    onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                    key={application.id}
                  >
                    <div className="operational-card-top"><span className={`application-stage stage-${applicationBucket(application.status).toLowerCase()}`}>{application.status}</span>{application.attention[0] && <span className={`attention-pill attention-${application.attention[0].level}`}>{application.attention[0].label}</span>}</div>
                    <h3>{application.role}</h3><strong>{application.company}</strong>
                    <p>{application.provider ?? "Provider not recorded"} · {application.daysInStage} days in stage</p>
                    <dl>
                      <div><dt>Applied</dt><dd>{application.appliedLabel}</dd></div>
                      <div><dt>Next follow-up</dt><dd>{application.nextFollowUp ?? "—"}</dd></div>
                      <div><dt>Next interview</dt><dd>{application.nextInterview ?? "—"}</dd></div>
                      <div><dt>Recent activity</dt><dd>{application.recentActivity ?? "—"}</dd></div>
                    </dl>
                    <div className="kanban-card-actions">
                      <button type="button" disabled={buckets.indexOf(bucket) === 0 || pending} onClick={() => adjacent(application, -1)} aria-label={`Move ${application.role} to the previous pipeline group`}>←</button>
                      <Link href={`/applications/${application.id}?from=kanban`}>Open</Link>
                      <button type="button" disabled={buckets.indexOf(bucket) === buckets.length - 1 || pending} onClick={() => adjacent(application, 1)} aria-label={`Move ${application.role} to the next pipeline group`}>→</button>
                    </div>
                  </article>
                ))}
                {!items.length && <p className="kanban-empty">Drop an application here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
