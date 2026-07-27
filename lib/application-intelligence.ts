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
