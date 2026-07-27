import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { applicationAttentionStates, applicationBucket, stageTone } from "@/lib/application-intelligence";
import { prisma } from "@/lib/db";
import { ApplicationKanban } from "./ApplicationKanban";
import { ApplicationWorkspaceControls } from "./ApplicationWorkspaceControls";

export const dynamic = "force-dynamic";

const views = ["kanban", "table", "timeline", "calendar"] as const;

function shortDate(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value)
    : "Not submitted";
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; archived?: string; q?: string; stage?: string; provider?: string; attention?: string; sort?: string; density?: string }>;
}) {
  const params = await searchParams;
  const view = views.includes(params.view as (typeof views)[number])
    ? params.view as (typeof views)[number]
    : "kanban";
  const showArchived = params.archived === "1";
  const applications = await prisma.application.findMany({
    where: {
      ...(showArchived ? {} : { archived: false }),
      ...(params.provider ? { sourceProvider: params.provider } : {}),
      ...(params.q ? { OR: [{ company: { contains: params.q } }, { role: { contains: params.q } }] } : {}),
    },
    include: {
      job: { include: { evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 } } },
      timeline: { orderBy: { eventAt: "desc" }, take: 3 },
      interviews: { orderBy: { scheduledAt: "asc" } },
      followUps: { where: { completedAt: null }, orderBy: { dueAt: "asc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
      attentionDismissals: true,
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
  const now = new Date();
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const operational = applications.map((application) => {
    const lastActivityAt = application.timeline[0]?.eventAt ?? application.updatedAt;
    const attention = applicationAttentionStates({
      status: application.status,
      lastActivityAt,
      now,
      followUps: application.followUps,
      interviews: application.interviews,
      dismissed: application.attentionDismissals.map((item) => item.attentionType),
    });
    const stageEnteredAt = application.statusHistory.find((item) => item.status === application.status)?.createdAt ?? application.updatedAt;
    return {
      id: application.id,
      company: application.company,
      role: application.role,
      status: application.status,
      appliedLabel: shortDate(application.appliedAt),
      daysInStage: Math.max(0, Math.floor((now.getTime() - stageEnteredAt.getTime()) / 86_400_000)),
      nextFollowUp: application.followUps.find((item) => !item.cancelledAt)?.description ?? null,
      nextInterview: application.interviews.find((item) => item.scheduledAt >= now && !item.cancelledAt)?.round ?? null,
      recentActivity: application.timeline[0]?.type ?? null,
      provider: application.sourceProvider,
      attention,
    };
  });
  const attentionCount = operational.filter((item) => item.attention.length).length;
  const followUpsDue = applications.reduce((sum, item) => sum + item.followUps.filter((followUp) => !followUp.cancelledAt && followUp.dueAt <= now).length, 0);
  const interviewsThisWeek = applications.reduce((sum, item) => sum + item.interviews.filter((interview) => !interview.cancelledAt && !interview.completedAt && interview.scheduledAt >= now && interview.scheduledAt <= weekEnd).length, 0);
  let visibleOperational = operational.filter((item) =>
    (!params.stage || applicationBucket(item.status) === params.stage)
    && (!params.attention || (params.attention === "yes" ? item.attention.length > 0 : item.attention.length === 0)),
  );
  if (params.sort === "company") visibleOperational = visibleOperational.sort((a, b) => a.company.localeCompare(b.company));
  if (params.sort === "stage") visibleOperational = visibleOperational.sort((a, b) => a.status.localeCompare(b.status));
  if (params.sort === "followup") visibleOperational = visibleOperational.sort((a, b) => (a.nextFollowUp ?? "zz").localeCompare(b.nextFollowUp ?? "zz"));
  const visibleIds = new Set(visibleOperational.map((item) => item.id));
  const visibleApplications = applications.filter((item) => visibleIds.has(item.id));
  const providers = [...new Set(applications.flatMap((item) => item.sourceProvider ? [item.sourceProvider] : []))].sort();

  return (
    <WorkspaceLayout className="applications-page">
      <PageHeader title="Applications" subtitle="Track active applications, interviews, follow-ups, and outcomes." />
      <div className="applications-primary-actions">
        <Link className="primary-button button-link" href="/review">Add Application</Link>
        <Link className="secondary-button button-link" href="/applications/reminders">Review Follow-ups</Link>
        <Link className="text-button" href="/applications?view=calendar">View Calendar</Link>
        <Link className="text-button" href={showArchived ? "/applications" : "/applications?archived=1"}>{showArchived ? "Hide Archived" : "Show Archived"}</Link>
      </div>
      <section className="application-overview" aria-labelledby="application-overview-title">
        <div><p className="eyebrow">Pipeline overview</p><h2 id="application-overview-title">Your application CRM</h2></div>
        <dl>
          <div><dt>In progress</dt><dd>{applications.filter((item) => !["Closed", "Accepted", "Rejected", "Withdrawn", "Declined"].includes(item.status)).length}</dd></div>
          <div><dt>Interviewing</dt><dd>{applications.filter((item) => applicationBucket(item.status) === "Interviewing").length}</dd></div>
          <div><dt>Offers</dt><dd>{applications.filter((item) => item.status === "Offer").length}</dd></div>
          <div><dt>Need attention</dt><dd>{attentionCount}</dd></div>
          <div><dt>Interviews this week</dt><dd>{interviewsThisWeek}</dd></div>
          <div><dt>Follow-ups due</dt><dd>{followUpsDue}</dd></div>
        </dl>
      </section>
      <ApplicationWorkspaceControls providers={providers} />

      {!applications.length && (
        <div className="applications-empty">
          <span aria-hidden="true">◎</span><h2>No applications yet</h2>
          <p>Begin from an opportunity when you are ready to prepare an external application.</p>
          <Link className="primary-button button-link" href="/review">Review opportunities</Link>
        </div>
      )}

      {applications.length > 0 && view === "kanban" && <ApplicationKanban applications={visibleOperational} />}

      {applications.length > 0 && view === "table" && (
        <div className="applications-table-wrap">
          <table className="applications-table">
            <thead><tr><th>Company</th><th>Role</th><th>Stage</th><th>Applied</th><th>Days in stage</th><th>Next follow-up</th><th>Next interview</th><th>Last activity</th><th>Attention</th><th>Actions</th></tr></thead>
            <tbody>{visibleApplications.map((application) => {
              const item = visibleOperational.find((entry) => entry.id === application.id)!;
              return (
              <tr key={application.id}>
                <td><Link href={`/applications/${application.id}`}>{application.company}</Link></td>
                <td>{application.role}</td>
                <td><span className={`application-stage stage-${stageTone(application.status)}`}>{application.status}</span></td>
                <td>{shortDate(application.appliedAt)}</td>
                <td>{item.daysInStage} days</td>
                <td>{application.followUps[0]?.description ?? "—"}</td>
                <td>{application.interviews.find((interview) => interview.scheduledAt >= now)?.round ?? "—"}</td>
                <td>{application.timeline[0]?.type ?? "—"}</td>
                <td>{item.attention[0]?.label ?? "Clear"}</td>
                <td><Link href={`/applications/${application.id}?from=table`}>Open</Link></td>
              </tr>
            )})}</tbody>
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
