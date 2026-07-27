export const APPLICATION_STAGES = [
  "Saved",
  "Preparing",
  "Applied",
  "Application Viewed",
  "Recruiter Contacted",
  "Recruiter Screen",
  "Hiring Manager Interview",
  "Technical Exercise",
  "Portfolio Review",
  "Panel Interview",
  "Executive Interview",
  "Reference Check",
  "Offer",
  "Accepted",
  "Declined",
  "Rejected",
  "Withdrawn",
  "Closed",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const APPLICATION_OUTCOMES = [
  "Accepted",
  "Rejected",
  "Withdrawn",
  "Declined",
  "No response",
] as const;

export function isApplicationStage(value: string): value is ApplicationStage {
  return APPLICATION_STAGES.includes(value as ApplicationStage);
}

export function applicationBucket(status: string) {
  if (["Saved", "Preparing"].includes(status)) return "Preparing";
  if (["Applied", "Application Viewed", "Recruiter Contacted"].includes(status)) return "Applied";
  if ([
    "Recruiter Screen",
    "Hiring Manager Interview",
    "Technical Exercise",
    "Portfolio Review",
    "Panel Interview",
    "Executive Interview",
    "Reference Check",
  ].includes(status)) return "Interviewing";
  if (["Offer", "Accepted", "Declined"].includes(status)) return "Offers";
  return "Closed";
}

export function stageTone(status: string) {
  const bucket = applicationBucket(status);
  return bucket.toLowerCase();
}

export function nextApplicationStage(status: string): ApplicationStage | null {
  const index = APPLICATION_STAGES.indexOf(status as ApplicationStage);
  if (index < 0 || index === APPLICATION_STAGES.length - 1) return null;
  return APPLICATION_STAGES[index + 1];
}

const INTERVIEW_STAGES = new Set<ApplicationStage>([
  "Recruiter Screen",
  "Hiring Manager Interview",
  "Technical Exercise",
  "Portfolio Review",
  "Panel Interview",
  "Executive Interview",
  "Reference Check",
]);
const TERMINAL_STAGES = new Set<ApplicationStage>([
  "Accepted",
  "Declined",
  "Rejected",
  "Withdrawn",
  "Closed",
]);

export function isTerminalApplicationStage(status: string) {
  return TERMINAL_STAGES.has(status as ApplicationStage);
}

export function validApplicationTransition(current: string, next: string) {
  if (!isApplicationStage(current) || !isApplicationStage(next) || current === next) return false;
  if (isTerminalApplicationStage(current)) return false;
  const currentBucket = applicationBucket(current);
  const nextBucket = applicationBucket(next);
  if (nextBucket === "Closed") return true;
  if (currentBucket === "Preparing") return nextBucket === "Applied";
  if (currentBucket === "Applied") return nextBucket === "Applied" || nextBucket === "Interviewing";
  if (currentBucket === "Interviewing") {
    return nextBucket === "Interviewing" || next === "Offer";
  }
  if (currentBucket === "Offers") return next === "Accepted" || next === "Declined";
  return false;
}

export function defaultStageForBucket(bucket: string): ApplicationStage | null {
  if (bucket === "Preparing") return "Preparing";
  if (bucket === "Applied") return "Applied";
  if (bucket === "Offers") return "Offer";
  if (bucket === "Closed") return "Closed";
  return null;
}

export function interviewStages() {
  return [...INTERVIEW_STAGES];
}

export type AttentionState = {
  type: string;
  label: string;
  level: "critical" | "warning" | "info";
  dismissible: boolean;
};

export function applicationAttentionStates(input: {
  status: string;
  lastActivityAt: Date;
  now?: Date;
  followUps: Array<{ type: string; dueAt: Date; completedAt: Date | null; cancelledAt?: Date | null }>;
  interviews: Array<{ scheduledAt: Date; completedAt?: Date | null; cancelledAt?: Date | null }>;
  dismissed?: string[];
}) {
  const now = input.now ?? new Date();
  const dismissed = new Set(input.dismissed ?? []);
  const states: AttentionState[] = [];
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const pending = input.followUps.filter((item) => !item.completedAt && !item.cancelledAt);
  if (pending.some((item) => item.dueAt < todayStart)) {
    states.push({ type: "follow-up-overdue", label: "Follow-up overdue", level: "critical", dismissible: false });
  } else if (pending.some((item) => item.dueAt >= todayStart && item.dueAt < tomorrowStart)) {
    states.push({ type: "follow-up-today", label: "Follow-up due today", level: "warning", dismissible: false });
  }
  const interviews = input.interviews.filter((item) => !item.completedAt && !item.cancelledAt);
  if (interviews.some((item) => item.scheduledAt >= todayStart && item.scheduledAt < tomorrowStart)) {
    states.push({ type: "interview-today", label: "Interview today", level: "critical", dismissible: false });
  } else if (interviews.some((item) => item.scheduledAt > now && item.scheduledAt <= weekEnd)) {
    states.push({ type: "interview-upcoming", label: "Interview upcoming", level: "info", dismissible: false });
  }
  const quietDays = Math.floor((now.getTime() - input.lastActivityAt.getTime()) / 86_400_000);
  if (quietDays >= 14) {
    states.push({ type: "quiet-14", label: "No activity for 14 days", level: "warning", dismissible: true });
  } else if (quietDays >= 7) {
    states.push({ type: "quiet-7", label: "No activity for 7 days", level: "info", dismissible: true });
  }
  if (input.status === "Preparing") {
    states.push({ type: "awaiting-user", label: "Awaiting your application", level: "info", dismissible: true });
  }
  if (input.status === "Offer" && pending.some((item) => /offer decision/i.test(item.type))) {
    states.push({ type: "offer-decision", label: "Offer decision due", level: "critical", dismissible: false });
  }
  return states.filter((state) => !dismissed.has(state.type));
}
