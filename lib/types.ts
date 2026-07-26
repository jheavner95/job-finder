export const JOB_STATUSES = [
  "New",
  "Strong Match",
  "Possible",
  "Rejected",
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Closed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const SCORE_CATEGORIES = [
  "roleFit",
  "seniorityFit",
  "domainFit",
  "strategicScope",
  "handsOnDesign",
  "portfolioEvidence",
  "compensationFit",
  "locationFit",
  "companyPreference",
  "riskPenalty",
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export type ScoringConfig = Record<
  ScoreCategory,
  { label: string; weight: number; isPenalty?: boolean; optional?: boolean }
>;

export const EVIDENCE_STATES = [
  "positive",
  "negative",
  "missing",
  "not_applicable",
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export type CategoryInput = {
  category: ScoreCategory;
  rating?: number;
  reason: string;
  evidence?: string;
  evidenceState?: EvidenceState;
};

export type CategoryResult = CategoryInput & {
  label: string;
  weight: number;
  contribution: number;
  evidenceState: EvidenceState;
};

export type HardRequirementCheck = {
  id: string;
  label: string;
  violated: boolean;
  reason: string;
};

export type JobFixture = {
  id: string;
  title: string;
  company: string;
  companyInitials: string;
  location: string;
  remoteStatus: string;
  employmentType: string;
  compensation: string | null;
  posted: string;
  source: string;
  sourceUrl: string;
  status: JobStatus;
  description: string;
  requirements: string[];
  concerns: string[];
  companyNotes: string;
  evaluationInputs: CategoryInput[];
  decision?: string;
};
