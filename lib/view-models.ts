import type { EligibilityAssessment } from "./eligibility/types";
import type { LevelFitAssessment } from "./level-fit/types";
import type { CategoryResult } from "./types";
import type { JobStatus } from "./types";
import type { OpportunityIntelligenceData } from "./candidate-intelligence/types";

export type JobListItem = {
  id: string;
  title: string;
  company: string;
  companyInitials: string;
  location: string;
  remoteStatus: string;
  employmentType: string;
  compensation: string;
  posted: string;
  source: string;
  sourceUrl: string;
  verification: {
    label: string;
    tone: "verified" | "warning" | "closed";
    importedAt: string;
    lastVerifiedAt: string;
    importAge: string;
    officialAts: string;
  };
  status: JobStatus;
  score: number;
  confidence: number;
  /**
   * The scoring engine's own hard-requirement flag. Retained unchanged: it is
   * driven by `scoreJob`'s `hardRequirements`, which the import path has never
   * populated. Eligibility below is the separate, evidence-backed answer.
   */
  eligibility: "eligible" | "excluded";
  /** Null when the job has not been assessed yet. */
  eligibilityAssessment: EligibilityAssessment | null;
  /** Career-level appropriateness. Independent of both score and eligibility. */
  levelFit: LevelFitAssessment | null;
  summary: string;
  matchReason: string;
  concerns: string[];
  isSynthetic: boolean;
};
export type JobDetailModel = JobListItem & {
  provenance: {
    discoveryMethod: string;
    canonicalUrl: string;
    duplicateImports: number;
    availability: string;
  };
  originalPosting: {
    title: string;
    company: string;
    location: string;
    employmentType: string;
    compensation: string;
    remoteStatus: string;
    description: string;
  };
  description: string;
  requirements: string[];
  companyNotes: string;
  categoryResults: CategoryResult[];
  evidence: {
    id: string;
    label: string;
    excerpt: string;
    relevance: string;
    contextFile: string;
  }[];
  activity: {
    id: string;
    type: string;
    summary: string;
    source: string;
    createdAt: string;
    changes: { field: string; before: string; after: string }[];
  }[];
  intelligence: OpportunityIntelligenceData | null;
};

export type DashboardSummary = {
  jobs: JobListItem[];
};

export type ReportSummary = {
  total: number;
  strong: number;
  possible: number;
  rejected: number;
};
