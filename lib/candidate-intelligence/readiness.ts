export const EVIDENCE_QUALITY = [
  "Verified",
  "Confirmed",
  "Partial",
  "Unknown",
  "Unsupported",
] as const;

export type EvidenceQuality = (typeof EVIDENCE_QUALITY)[number];

function known(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string"
    ? Boolean(value.trim()) && value.trim().toLowerCase() !== "unknown"
    : value !== null && value !== undefined;
}

export function calculatePortfolioReadiness(project: {
  employer?: string | null;
  timeframe?: string | null;
  role?: string | null;
  responsibilities?: unknown;
  problem?: string | null;
  solution?: string | null;
  businessOutcome?: string | null;
  designOutcome?: string | null;
  researchPerformed?: string | null;
  leadershipDemonstrated?: string | null;
  crossFunctionalPartners?: unknown;
  industry?: string | null;
  productType?: string | null;
  platform?: string | null;
  enterpriseScale?: string | null;
  designSystemUsage?: string | null;
  accessibilityWork?: string | null;
  aiUsage?: string | null;
  artifactsAvailable?: unknown;
  confidentiality?: string | null;
  evidenceQuality: EvidenceQuality;
}) {
  const documentationFields = [
    project.employer,
    project.timeframe,
    project.role,
    project.responsibilities,
    project.problem,
    project.solution,
    project.researchPerformed,
    project.leadershipDemonstrated,
    project.crossFunctionalPartners,
    project.industry,
    project.productType,
    project.platform,
    project.enterpriseScale,
    project.designSystemUsage,
    project.accessibilityWork,
    project.aiUsage,
    project.confidentiality,
  ];
  const documentationCompleteness = Math.round(
    documentationFields.filter(known).length / documentationFields.length * 100,
  );
  const visualEvidenceReadiness = known(project.artifactsAvailable) ? 100 : 0;
  const outcomeEvidenceReadiness = Math.round(
    [project.businessOutcome, project.designOutcome].filter(known).length / 2 * 100,
  );
  const interviewFields = [
    project.role,
    project.responsibilities,
    project.problem,
    project.solution,
    project.businessOutcome,
    project.designOutcome,
  ];
  const interviewReadiness = Math.round(
    interviewFields.filter(known).length / interviewFields.length * 100,
  );
  const portfolioReadiness = Math.round(
    (
      documentationCompleteness
      + visualEvidenceReadiness
      + outcomeEvidenceReadiness
      + interviewReadiness
    ) / 4,
  );
  const qualityScore: Record<EvidenceQuality, number> = {
    Verified: 100,
    Confirmed: 80,
    Partial: 40,
    Unknown: 0,
    Unsupported: 0,
  };
  return {
    documentationCompleteness,
    visualEvidenceReadiness,
    outcomeEvidenceReadiness,
    interviewReadiness,
    portfolioReadiness,
    confidence: Math.round(
      (portfolioReadiness + qualityScore[project.evidenceQuality]) / 2,
    ),
  };
}
