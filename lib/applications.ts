import { cleanLocation } from "./opportunity-presentation";
import type { JobStatus } from "./types";
import type { JobListItem } from "./view-models";

/**
 * Applications, derived from decisions.
 *
 * The product already had an applicant-tracking system: an `Application` table
 * with nine child tables — contacts, communications, documents, interviews,
 * follow-ups, timeline events, status history — eighteen lifecycle stages
 * including "Recruiter Screen" and "Reference Check", and 463 lines of server
 * actions. It held zero rows, because the only route into it was a conversion
 * form the user never opened.
 *
 * Meanwhile `UserDecision` held four APPLIED decisions, and Applications read
 * the empty table, so the product said "No applications yet" about work the
 * user had explicitly recorded.
 *
 * The fix is not to copy decisions into applications. It is to notice that a
 * decision history already *is* an application: when you applied, what happened
 * after, and when it last moved. Deriving means there is one source of truth,
 * nothing to backfill, and no date this product has to invent.
 */

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

/**
 * Four states, because an individual tracking their own search needs to know
 * which of four things is true, and nothing finer.
 *
 * Waiting on them · talking to them · deciding · over. The eighteen-stage
 * funnel underneath ("Application Viewed", "Recruiter Contacted", "Panel
 * Interview") is recruiting software's model of a hiring process, not a
 * candidate's model of their own week.
 */
export const APPLICATION_STATES = ["applied", "interviewing", "offer", "closed"] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export const APPLICATION_STATE_LABEL: Record<ApplicationState, string> = {
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

/** Still live: something could still happen without the employer being done. */
export const ACTIVE_STATES: ApplicationState[] = ["applied", "interviewing", "offer"];

/**
 * The decisions that move an application, in order of progress.
 *
 * `Saved` and the discovery classifications are absent: they describe an
 * opportunity you have not applied to, so they cannot be application states.
 */
const STATE_OF: Partial<Record<JobStatus, ApplicationState>> = {
  Applied: "applied",
  Interviewing: "interviewing",
  Offer: "offer",
  Rejected: "closed",
  Closed: "closed",
};

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

export type ApplicationEvent = {
  state: ApplicationState;
  label: string;
  at: string;
  note: string | null;
};

export type DerivedApplication = {
  jobId: string;
  href: string;
  company: string;
  role: string;
  state: ApplicationState;
  /**
   * What actually ended it, when "closed" is too coarse. Null while active —
   * an application in flight has no outcome to report.
   */
  outcome: string | null;
  /** When the user recorded applying. Read from the decision, never inferred. */
  appliedAt: string;
  /** The most recent decision on this application, which may be the same one. */
  lastActivityAt: string;
  /** Whole days since that decision, for "nothing has moved" without a timer. */
  daysSinceActivity: number;
  /** Ordinary metadata, same grammar as an opportunity row. */
  facts: string[];
  /** Everything recorded, newest first. Not a timeline widget — a short list. */
  history: ApplicationEvent[];
  active: boolean;
};

const dayMs = 86_400_000;

/**
 * The decision that made this an application.
 *
 * The *first* APPLIED, not the latest: re-recording a decision should not
 * rewrite the day you applied, and a later APPLIED after an Interviewing
 * would otherwise move the date forward.
 */
function firstApplied(job: JobListItem) {
  return [...job.decisions].reverse().find((decision) => decision.status === "Applied");
}

export function deriveApplication(job: JobListItem, now: Date): DerivedApplication | null {
  const applied = firstApplied(job);
  if (!applied) return null;

  /*
   * Only what happened at or after applying counts.
   *
   * A "Rejected" recorded before the user applied is passing on the
   * opportunity; the same decision recorded afterwards is the employer's
   * answer. The schema cannot tell them apart, but the sequence can, and no
   * migration is needed to read it.
   */
  const since = job.decisions
    .filter((decision) => decision.at >= applied.at && STATE_OF[decision.status])
    .sort((left, right) => right.at.localeCompare(left.at));

  const latest = since[0] ?? applied;
  const state = STATE_OF[latest.status] ?? "applied";
  const lastActivityAt = latest.at;

  return {
    jobId: job.id,
    // The opportunity page is the canonical detail surface; an application is
    // a state that page carries, not a second record with its own page.
    href: `/jobs/${job.id}`,
    company: job.company,
    role: job.title,
    state,
    outcome: state === "closed" ? (latest.status === "Rejected" ? "Not selected" : "No longer open") : null,
    appliedAt: applied.at,
    lastActivityAt,
    daysSinceActivity: Math.max(
      0,
      Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / dayMs),
    ),
    facts: applicationFacts(job),
    history: since.map((decision) => ({
      state: STATE_OF[decision.status] as ApplicationState,
      label: decision.status === "Applied" ? "Applied" : decision.status,
      at: decision.at,
      note: decision.note,
    })),
    active: ACTIVE_STATES.includes(state),
  };
}

/**
 * Location and pay, and nothing about fit.
 *
 * The tier that made this worth applying to has done its job; after applying,
 * a score is a number you can no longer act on. Work mode and salary still
 * matter, because they are what you will be asked about.
 */
function applicationFacts(job: JobListItem): string[] {
  const facts: string[] = [];
  const mode = job.workMode?.postingMode;
  if (mode && mode !== "unknown") facts.push({ remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[mode]);
  const place = cleanLocation(job.location);
  if (place) facts.push(place);
  if (job.compensation && !/^(not listed|n\/?a|tbd|none|unknown|-|—)$/i.test(job.compensation.trim())) {
    facts.push(job.compensation);
  }
  return facts;
}

/* ------------------------------------------------------------------ *
 * The workspace
 * ------------------------------------------------------------------ */

/** How long without any recorded change before an application is worth a nudge. */
export const STALE_AFTER_DAYS = 21;

export type ApplicationsModel = {
  all: DerivedApplication[];
  active: DerivedApplication[];
  closed: DerivedApplication[];
  /** Counts per state, used only to decide which filters are worth offering. */
  stateCounts: Record<ApplicationState, number>;
  /** Active applications with nothing recorded in three weeks. */
  stale: DerivedApplication[];
};

export function buildApplications(jobs: JobListItem[], now: Date): ApplicationsModel {
  const all = jobs
    .map((job) => deriveApplication(job, now))
    .filter((application): application is DerivedApplication => application !== null)
    // Most recently moved first: what changed is what you want to see.
    .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));

  const active = all.filter((application) => application.active);
  return {
    all,
    active,
    closed: all.filter((application) => !application.active),
    stateCounts: Object.fromEntries(
      APPLICATION_STATES.map((state) => [state, all.filter((a) => a.state === state).length]),
    ) as Record<ApplicationState, number>,
    stale: active.filter((application) => application.daysSinceActivity >= STALE_AFTER_DAYS),
  };
}

/** "Applied 14 days ago" — the one fact that tells you whether to chase it. */
export function sinceLabel(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / dayMs);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
