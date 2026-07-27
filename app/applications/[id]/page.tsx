import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceLayout } from "@/app/components/PageLayout";
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  applicationAttentionStates,
  stageTone,
} from "@/lib/application-intelligence";
import { prisma } from "@/lib/db";

import {
  addCommunicationAction,
  addContactAction,
  addDocumentAction,
  addFollowUpAction,
  addInterviewAction,
  addTimelineEventAction,
  archiveApplicationAction,
  cancelFollowUpAction,
  completeFollowUpAction,
  dismissAttentionAction,
  editApplicationDetailsAction,
  snoozeFollowUpAction,
  updateInterviewAction,
  updateApplicationStatusAction,
} from "../actions";

export const dynamic = "force-dynamic";

function fullDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      job: true,
      statusHistory: { orderBy: { createdAt: "desc" } },
      timeline: {
        include: { relatedContact: true, relatedDocument: true },
        orderBy: { eventAt: "desc" },
      },
      contacts: { orderBy: { createdAt: "desc" } },
      communications: { include: { contact: true }, orderBy: { occurredAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      interviews: { orderBy: { scheduledAt: "asc" } },
      followUps: { orderBy: { dueAt: "asc" } },
      attentionDismissals: true,
    },
  });
  if (!application) notFound();
  const now = new Date();
  const pendingFollowUps = application.followUps.filter((item) => !item.completedAt && !item.cancelledAt);
  const nextInterview = application.interviews.find((item) => item.scheduledAt >= now && !item.cancelledAt && !item.completedAt);
  const lastActivityAt = application.timeline[0]?.eventAt ?? application.updatedAt;
  const attention = applicationAttentionStates({
    status: application.status,
    lastActivityAt,
    now,
    followUps: application.followUps,
    interviews: application.interviews,
    dismissed: application.attentionDismissals.map((item) => item.attentionType),
  });
  const daysActive = application.appliedAt ? Math.max(0, Math.floor((now.getTime() - application.appliedAt.getTime()) / 86_400_000)) : 0;

  return (
    <WorkspaceLayout className="application-detail-page">
      <Link className="back-link" href="/applications">← Applications</Link>
      <header className="application-detail-hero">
        <div>
          <p className="eyebrow">{application.company}</p>
          <h1>{application.role}</h1>
          <p>{application.location ?? "Location not recorded"} · {application.sourceProvider ?? "Source not recorded"}</p>
          <span className={`application-stage stage-${stageTone(application.status)}`}>{application.status}</span>
        </div>
        <div className="application-hero-actions">
          <a className="primary-button button-link" href="#update-stage">Update Stage</a>
          <a className="secondary-button button-link" href="#quick-activity">Add Activity</a>
          <a className="secondary-button button-link" href="#reminders">Add Follow-up</a>
          <a className="secondary-button button-link" href="#interviews">Add Interview</a>
          <Link className="secondary-button button-link" href={application.applicationUrl ?? application.job.sourceUrl} target="_blank" rel="noreferrer">Open Original Posting</Link>
          <Link className="text-button" href={`/jobs/${application.jobId}`}>View Opportunity</Link>
          <form action={archiveApplicationAction}><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="archived" value={application.archived ? "false" : "true"} /><button className="text-button">{application.archived ? "Restore" : "Archive"}</button></form>
        </div>
      </header>

      <section className="application-command-bar" id="update-stage" aria-labelledby="current-stage-title">
        <div><p className="eyebrow">Current stage</p><h2 id="current-stage-title">{application.currentStage}</h2></div>
        <div className="application-command-facts"><span>Applied {application.appliedAt ? fullDate(application.appliedAt) : "Not yet"}</span><span>{daysActive} days active</span><span>Next action {pendingFollowUps[0]?.description ?? "Not scheduled"}</span></div>
        {application.status === "Preparing" ? (
          <form action={updateApplicationStatusAction}>
            <input type="hidden" name="applicationId" value={application.id} />
            <input type="hidden" name="status" value="Applied" />
            <button className="primary-button">Mark Applied</button>
            <small>Use only after submitting on the employer&apos;s site.</small>
          </form>
        ) : (
          <form action={updateApplicationStatusAction} className="stage-update-form">
            <input type="hidden" name="applicationId" value={application.id} />
            <label>Move to<select name="status" defaultValue={application.status}>{APPLICATION_STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
            <label>Note<input name="notes" placeholder="Optional context" /></label>
            <button className="secondary-button">Update stage</button>
          </form>
        )}
      </section>
      {attention.length > 0 && <section className="application-attention-list" aria-label="Application attention">
        {attention.map((item) => <article className={`attention-${item.level}`} key={item.type}><strong>{item.label}</strong>{item.dismissible && <form action={dismissAttentionAction}><input type="hidden" name="applicationId" value={application.id} /><input type="hidden" name="attentionType" value={item.type} /><button>Dismiss</button></form>}</article>)}
      </section>}

      <div className="application-detail-summary">
        <section aria-labelledby="recent-activity-title">
          <div className="application-section-heading"><div><p className="eyebrow">Recent activity</p><h2 id="recent-activity-title">Application timeline</h2></div></div>
          <div className="application-timeline">
            {application.timeline.slice(0, 6).map((event) => (
              <article key={event.id}><time>{fullDate(event.eventAt)}</time><span /><div><strong>{event.type}</strong>{event.notes && <p>{event.notes}</p>}{event.relatedContact && <small>Contact: {event.relatedContact.name}</small>}{event.relatedDocument && <small>Document: {event.relatedDocument.versionLabel}</small>}</div></article>
            ))}
          </div>
          {!application.timeline.length && <p className="compact-empty">No activity recorded yet.</p>}
        </section>
        <aside>
          <section><p className="eyebrow">Next follow-up</p>{pendingFollowUps[0] ? <><strong>{pendingFollowUps[0].description}</strong><time>{fullDate(pendingFollowUps[0].dueAt)}</time></> : <p>Nothing scheduled.</p>}</section>
          <section className="next-interview-card"><p className="eyebrow">Next interview</p>{nextInterview ? <><strong>{nextInterview.round}</strong><time>{fullDate(nextInterview.scheduledAt)}</time>{nextInterview.participants && <small>{nextInterview.participants}</small>}{nextInterview.locationUrl && <a className="primary-button button-link" href={nextInterview.locationUrl} target="_blank" rel="noreferrer">Join Meeting</a>}<div><a href="#interviews">Open Preparation</a><a href="#interviews">Reschedule</a></div></> : <p>No interview scheduled.</p>}</section>
          <section><p className="eyebrow">Submitted</p><strong>{application.appliedAt ? fullDate(application.appliedAt) : "Not yet applied"}</strong></section>
        </aside>
      </div>

      <section className="application-workspace-grid">
        <details>
          <summary><span>Edit details</span><small>Application snapshot</small></summary>
          <div className="application-detail-panel">
            <form action={editApplicationDetailsAction} className="application-record-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <label>Company<input name="company" defaultValue={application.company} required /></label>
              <label>Role<input name="role" defaultValue={application.role} required /></label>
              <label>Location<input name="location" defaultValue={application.location ?? ""} /></label>
              <label>Salary<input name="salary" defaultValue={application.salary ?? ""} /></label>
              <label>Industry<input name="industry" defaultValue={application.industry ?? ""} /></label>
              <label>Recruiter<input name="recruiter" defaultValue={application.recruiter ?? ""} /></label>
              <label>Hiring manager<input name="hiringManager" defaultValue={application.hiringManager ?? ""} /></label>
              <label className="wide">Application URL<input name="applicationUrl" type="url" defaultValue={application.applicationUrl ?? ""} /></label>
              <label className="wide">Notes<textarea name="notes" rows={3} defaultValue={application.notes ?? ""} /></label>
              <button className="secondary-button">Save details</button>
            </form>
          </div>
        </details>
        <details open id="reminders">
          <summary><span>Follow-ups</span><small>{pendingFollowUps.length} pending</small></summary>
          <div className="application-detail-panel">
            {pendingFollowUps.map((followUp) => (
              <article className="follow-up-row" key={followUp.id}><div><strong>{followUp.description}</strong><small>{followUp.type} · {fullDate(followUp.dueAt)}</small></div><div className="follow-up-actions"><form action={completeFollowUpAction}><input type="hidden" name="followUpId" value={followUp.id} /><button className="source-run">Complete</button></form><form action={snoozeFollowUpAction}><input type="hidden" name="followUpId" value={followUp.id} /><button className="source-run">Snooze 3 days</button></form><form action={cancelFollowUpAction}><input type="hidden" name="followUpId" value={followUp.id} /><button className="danger-text-button">Cancel</button></form></div></article>
            ))}
            <form action={addFollowUpAction} className="application-inline-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <label>Reminder type<select name="type"><option>Recruiter follow-up</option><option>Hiring manager follow-up</option><option>Thank-you note</option><option>Application status check</option><option>Interview preparation</option><option>Offer decision</option><option>Custom</option></select></label>
              <label>Description<input name="description" required placeholder="Send thank-you email" /></label>
              <label>Due<input name="dueAt" type="datetime-local" required /></label>
              <label>Contact<select name="contactId"><option value="">None</option>{application.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
              <button className="secondary-button">Add reminder</button>
            </form>
          </div>
        </details>

        <details id="interviews">
          <summary><span>Interviews</span><small>{application.interviews.length} recorded</small></summary>
          <div className="application-detail-panel">
            {application.interviews.map((interview) => <article className="record-card interview-record" key={interview.id}>
              <strong>{interview.round}</strong>
              <span>{interview.type} · {fullDate(interview.scheduledAt)}</span>
              {interview.participants && <p>{interview.participants}</p>}
              {interview.locationUrl && <a href={interview.locationUrl} target="_blank" rel="noreferrer">Meeting link</a>}
              {interview.preparationNotes && <small>{interview.preparationNotes}</small>}
              <div>
                <form action={updateInterviewAction}><input type="hidden" name="interviewId" value={interview.id} /><input type="hidden" name="operation" value="complete" /><input type="hidden" name="createThankYou" value="true" /><button className="source-run">Mark Complete</button></form>
                <form action={updateInterviewAction}><input type="hidden" name="interviewId" value={interview.id} /><input type="hidden" name="operation" value="cancel" /><button className="danger-text-button">Cancel</button></form>
              </div>
              <details>
                <summary>Edit or reschedule</summary>
                <form action={updateInterviewAction} className="application-record-form">
                  <input type="hidden" name="interviewId" value={interview.id} />
                  <input type="hidden" name="operation" value="edit" />
                  <label>Round<input name="round" defaultValue={interview.round} required /></label>
                  <label>Type<input name="type" defaultValue={interview.type} required /></label>
                  <label>Participants<input name="participants" defaultValue={interview.participants ?? ""} /></label>
                  <label>Date<input name="scheduledAt" type="datetime-local" defaultValue={interview.scheduledAt.toISOString().slice(0, 16)} required /></label>
                  <label>Duration<input name="durationMinutes" type="number" min="1" defaultValue={interview.durationMinutes ?? ""} /></label>
                  <label>Timezone<input name="timezone" defaultValue={interview.timezone ?? ""} /></label>
                  <label className="wide">Location or meeting URL<input name="locationUrl" defaultValue={interview.locationUrl ?? ""} /></label>
                  <label className="wide">Preparation notes<textarea name="preparationNotes" rows={3} defaultValue={interview.preparationNotes ?? ""} /></label>
                  <label className="wide">Questions to ask<textarea name="questionsToAsk" rows={3} defaultValue={interview.questionsToAsk ?? ""} /></label>
                  <button className="secondary-button">Save interview</button>
                </form>
              </details>
            </article>)}
            <form action={addInterviewAction} className="application-record-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <label>Round<input name="round" required placeholder="Recruiter screen" /></label>
              <label>Type<select name="type"><option>Video</option><option>Phone</option><option>On-site</option><option>Exercise</option></select></label>
              <label>Participants<input name="participants" /></label>
              <label>Date<input name="scheduledAt" type="datetime-local" required /></label>
              <label>Duration<input name="durationMinutes" type="number" min="1" placeholder="30" /></label>
              <label>Timezone<input name="timezone" placeholder="America/Chicago" /></label>
              <label>Format<select name="format"><option>Video</option><option>Phone</option><option>On-site</option><option>Take-home</option></select></label>
              <label className="wide">Location or meeting URL<input name="locationUrl" /></label>
              <label className="wide">Preparation notes<textarea name="preparationNotes" rows={3} /></label>
              <label className="wide">Questions to ask<textarea name="questionsToAsk" rows={3} /></label>
              <label><input name="followUpRequired" type="checkbox" /> Follow-up required</label>
              <button className="secondary-button">Add interview</button>
            </form>
          </div>
        </details>

        <details>
          <summary><span>Contacts</span><small>{application.contacts.length} people</small></summary>
          <div className="application-detail-panel">
            <div className="record-grid">{application.contacts.map((contact) => <article className="record-card" key={contact.id}><span>{contact.kind}</span><strong>{contact.name}</strong>{contact.role && <p>{contact.role}</p>}{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.linkedin && <a href={contact.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}</article>)}</div>
            <form action={addContactAction} className="application-record-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <label>Contact type<select name="kind"><option>Recruiter</option><option>Hiring manager</option><option>Referral</option><option>Coordinator</option></select></label>
              <label>Name<input name="name" required /></label><label>Role<input name="role" /></label>
              <label>Email<input name="email" type="email" /></label><label>LinkedIn<input name="linkedin" type="url" /></label>
              <label className="wide">Notes<textarea name="notes" rows={3} /></label>
              <button className="secondary-button">Add contact</button>
            </form>
          </div>
        </details>

        <details>
          <summary><span>Communication log</span><small>{application.communications.length} entries</small></summary>
          <div className="application-detail-panel">
            {application.communications.map((item) => <article className="record-card" key={item.id}><span>{item.channel} · {item.direction}</span><strong>{item.summary}</strong><small>{fullDate(item.occurredAt)}{item.contact ? ` · ${item.contact.name}` : ""}</small></article>)}
            <form action={addCommunicationAction} className="application-record-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <label>Channel<select name="channel"><option>Email</option><option>LinkedIn</option><option>Phone</option><option>Meeting</option><option>Message</option></select></label>
              <label>Direction<select name="direction"><option>Received</option><option>Sent</option></select></label>
              <label>Date<input name="occurredAt" type="datetime-local" required /></label>
              <label>Contact<select name="contactId"><option value="">None</option>{application.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
              <label className="wide">Summary<textarea name="summary" required rows={3} /></label>
              <label className="wide">Attachment reference<input name="attachment" /></label>
              <button className="secondary-button">Log communication</button>
            </form>
          </div>
        </details>

        <details>
          <summary><span>Document snapshots</span><small>{application.documents.length} versions</small></summary>
          <div className="application-detail-panel">
            <div className="record-grid">{application.documents.map((document) => <article className="record-card" key={document.id}><span>{document.kind}</span><strong>{document.versionLabel}</strong>{document.submittedAt && <small>Submitted {fullDate(document.submittedAt)}</small>}{document.referenceUrl && <a href={document.referenceUrl} target="_blank" rel="noreferrer">Open reference</a>}</article>)}</div>
            <form action={addDocumentAction} className="application-record-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <label>Document<select name="kind"><option>Resume</option><option>Portfolio</option><option>Cover Letter</option><option>Personal Website</option><option>GitHub</option><option>LinkedIn</option></select></label>
              <label>Version label<input name="versionLabel" required placeholder="Resume v3 — enterprise" /></label>
              <label>Reference URL<input name="referenceUrl" type="url" /></label>
              <label>Submitted at<input name="submittedAt" type="datetime-local" /></label>
              <label className="wide">Notes<textarea name="notes" rows={3} /></label>
              <button className="secondary-button">Save snapshot</button>
            </form>
          </div>
        </details>

        <details id="quick-activity">
          <summary><span>Complete timeline</span><small>{application.timeline.length} immutable events</small></summary>
          <div className="application-detail-panel">
            <div className="application-timeline">{application.timeline.map((event) => <article key={event.id}><time>{fullDate(event.eventAt)}</time><span /><div><strong>{event.type}</strong>{event.notes && <p>{event.notes}</p>}</div></article>)}</div>
            <form action={addTimelineEventAction} className="application-inline-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <label>Event type<input name="type" required placeholder="Follow-up sent" /></label>
              <label>When<input name="eventAt" type="datetime-local" /></label>
              <label>Notes<input name="notes" /></label>
              <label>Contact<select name="relatedContactId"><option value="">None</option>{application.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>
              <label>Optional next action<input name="nextAction" /></label>
              <label>Next action due<input name="nextActionAt" type="datetime-local" /></label>
              <button className="secondary-button">Add event</button>
            </form>
          </div>
        </details>

        <details>
          <summary><span>Outcome and history</span><small>{application.statusHistory.length} stages preserved</small></summary>
          <div className="application-detail-panel">
            <ol className="status-history">{application.statusHistory.map((item) => <li key={item.id}><span>{item.status}</span><time>{fullDate(item.createdAt)}</time>{item.notes && <p>{item.notes}</p>}</li>)}</ol>
            <form action={updateApplicationStatusAction} className="application-record-form">
              <input type="hidden" name="applicationId" value={application.id} />
              <input type="hidden" name="confirmTerminal" value="true" />
              <label>Outcome<select name="status">{APPLICATION_OUTCOMES.map((outcome) => <option key={outcome}>{outcome}</option>)}</select></label>
              <label>Decision date<input name="outcomeDate" type="date" required /></label>
              <label className="wide">Reason, if known<input name="rejectionReason" placeholder="Optional; never inferred" /></label>
              <label>Future eligibility<input name="futureEligibility" placeholder="Optional" /></label>
              <label>Start date<input name="startDate" type="date" /></label>
              <label className="wide">Compensation notes<input name="compensationNotes" /></label>
              <label className="wide">Notes<textarea name="notes" rows={3} /></label>
              <button className="secondary-button">Record outcome</button>
            </form>
          </div>
        </details>
      </section>
    </WorkspaceLayout>
  );
}
