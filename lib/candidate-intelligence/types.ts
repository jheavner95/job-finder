export type IntelligenceEvidenceRef = {
  id: string;
  label: string;
  source: string;
  excerpt: string;
  confidence: "confirmed" | "high-level" | "job";
};

export type IntelligenceGuidanceItem = {
  title: string;
  explanation: string;
  evidence: IntelligenceEvidenceRef[];
  status: "supported" | "missing" | "concern" | "prepare";
};

export type OpportunityIntelligenceData = {
  version: string;
  topReason: string;
  strengths: IntelligenceGuidanceItem[];
  missingEvidence: IntelligenceGuidanceItem[];
  concerns: IntelligenceGuidanceItem[];
  confidenceExplanation: string;
  matchedSkills: IntelligenceGuidanceItem[];
  matchedIndustries: IntelligenceGuidanceItem[];
  matchedDomains: IntelligenceGuidanceItem[];
  leadershipSignals: IntelligenceGuidanceItem[];
  portfolioRecommendations: IntelligenceGuidanceItem[];
  resumeRecommendations: IntelligenceGuidanceItem[];
  interviewTopics: IntelligenceGuidanceItem[];
  preparationChecklist: IntelligenceGuidanceItem[];
};
