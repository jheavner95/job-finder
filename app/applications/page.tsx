import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { applicationBucket, stageTone } from "@/lib/application-intelligence";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const views = ["kanban", "table", "timeline", "calendar"] as const;
const buckets = ["Preparing", "Applied", "Interviewing", "Offers", "Closed"];

function shortDate(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value)
    : "Not submitted";
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = views.includes(params.view as (typeof views)[number])
    ? params.view as (typeof views)[number]
    : "kanban";
  const applications = await prisma.application.findMany({
    include: {
      job: { include: { evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 } } },
      timeline: { orderBy: { eventAt: "desc" }, take: 3 },
      interviews: { orderBy: { scheduledAt: "asc" } },
      followUps: { where: { completedAt: null }, orderBy: { dueAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const timeline = applications
    .flatMap((application) => application.timeline.map((event) => ({ application, event })))
    .sort((a, b) => b.event.eventAt.getTime() - a.event.eventAt.getTime());
  const calendar = applications
    .flatMap((application) => [
      ...application.interviews.map((item) => ({ application, date: item.scheduledAt, type: "Interview", label: `${item.round} · ${item.type}` })),
      ...application.followUps.map((item) => ({ application, date: item.dueAt, type: item.type, label: item.description })),
    ])
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <WorkspaceLayout className="applications-page">
      <PageHeader title="Applications" subtitle="Track every application from preparation through final outcome." />
      <section className="application-overview" aria-labelledby="application-overview-title">
        <div><p className="eyebrow">Pipeline overview</p><h2 id="application-overview-title">Your application CRM</h2></div>
        <dl>
          <div><dt>In progress</dt><dd>{applications.filter((item) => !["Closed", "Accepted", "Rejected", "Withdrawn", "Declined"].includes(item.status)).length}</dd></div>
          <div><dt>Interviewing</dt><dd>{applications.filter((item) => applicationBucket(item.status) === "Interviewing").length}</dd></div>
          <div><dt>Offers</dt><dd>{applications.filter((item) => item.status === "Offer").length}</dd></div>
          <div><dt>Follow-ups due</dt><dd>{applications.reduce((sum, item) => sum + item.followUps.length, 0)}</dd></div>
        </dl>
      </section>
      <nav className="application-view-tabs" aria-label="Application views">
        {views.map((item) => (
          <Link key={item} href={`/applications?view=${item}`} aria-current={view === item ? "page" : undefined}>
            {item[0].toUpperCase() + item.slice(1)}
          </Link>
        ))}
      </nav>

      {!applications.length && (
        <div className="applications-empty">
          <span aria-hidden="true">◎</span><h2>No applications yet</h2>
          <p>Begin from an opportunity when you are ready to prepare an external application.</p>
          <Link className="primary-button button-link" href="/review">Review opportunities</Link>
        </div>
      )}

      {applications.length > 0 && view === "kanban" && (
        <div className="application-kanban">
          {buckets.map((bucket) => {
            const items = applications.filter((item) => applicationBucket(item.status) === bucket);
            return (
              <section key={bucket} aria-labelledby={`bucket-${bucket.toLowerCase()}`}>
                <header><h2 id={`bucket-${bucket.toLowerCase()}`}>{bucket}</h2><span>{items.length}</span></header>
                <div>
                  {items.map((application) => (
                    <article className="application-kanban-card" key={application.id}>
                      <span className={`application-stage stage-${stageTone(application.status)}`}>{application.status}</span>
                      <h3>{application.role}</h3><strong>{application.company}</strong>
                      <p>{application.location ?? "Location not recorded"}</p>
                      <dl>
                        <div><dt>Applied</dt><dd>{shortDate(application.appliedAt)}</dd></div>
                        <div><dt>Match</dt><dd>{application.job.evaluations[0]?.score ?? "—"}</dd></div>
                      </dl>
                      {application.followUps[0] && <small>Next: {application.followUps[0].description}</small>}
                      <Link href={`/applications/${application.id}`}>Open application →</Link>
                    </article>
                  ))}
                  {!items.length && <p className="kanban-empty">No applications</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {applications.length > 0 && view === "table" && (
        <div className="applications-table-wrap">
          <table className="applications-table">
            <thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Applied</th><th>Next action</th><th>Outcome</th></tr></thead>
            <tbody>{applications.map((application) => (
              <tr key={application.id}>
                <td><Link href={`/applications/${application.id}`}>{application.company}</Link></td>
                <td>{application.role}</td>
                <td><span className={`application-stage stage-${stageTone(application.status)}`}>{application.status}</span></td>
                <td>{shortDate(application.appliedAt)}</td>
                <td>{application.followUps[0]?.description ?? "—"}</td>
                <td>{application.outcome ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {applications.length > 0 && view === "timeline" && (
        <div className="applications-master-timeline">
          {timeline.map(({ application, event }) => (
            <article key={event.id}>
              <time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(event.eventAt)}</time>
              <span />
              <div><strong>{event.type}</strong><p>{application.company} · {application.role}</p>{event.notes && <small>{event.notes}</small>}</div>
              <Link href={`/applications/${application.id}`}>View</Link>
            </article>
          ))}
        </div>
      )}

      {applications.length > 0 && view === "calendar" && (
        <div className="application-calendar-list">
          {calendar.map((item, index) => (
            <article key={`${item.application.id}-${item.type}-${index}`}>
              <time><strong>{shortDate(item.date)}</strong><span>{item.date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></time>
              <div><span>{item.type}</span><h3>{item.label}</h3><p>{item.application.company} · {item.application.role}</p></div>
              <Link href={`/applications/${item.application.id}`}>Open →</Link>
            </article>
          ))}
          {!calendar.length && <p className="calendar-empty">No interviews or follow-ups are scheduled.</p>}
        </div>
      )}
    </WorkspaceLayout>
  );
}
