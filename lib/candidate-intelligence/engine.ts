import type {
  CandidateIntelligenceEvidence,
  CandidatePortfolioProject,
  CandidateResumeEvidence,
} from "@prisma/client";

import type {
  IntelligenceEvidenceRef,
  IntelligenceGuidanceItem,
  OpportunityIntelligenceData,
} from "./types";

export const INTELLIGENCE_VERSION = "candidate-evidence-v1";

type EvidenceInput = CandidateIntelligenceEvidence & {
  projectLinks?: Array<{
    evidenceQuality: string;
    sourceExcerpt: string;
    project: CandidatePortfolioProject;
  }>;
  resumeLinks?: Array<{
    evidenceQuality: string;
    sourceExcerpt: string;
    resumeEvidence: CandidateResumeEvidence;
  }>;
};

type PortfolioInput = Pick<
  CandidatePortfolioProject,
  | "id"
  | "name"
  | "sourceDocument"
  | "sourceExcerpt"
  | "evidenceStatus"
  | "evidenceQuality"
  | "portfolioReadiness"
>;

type OpportunityInput = {
  title: string;
  company: string;
  description: string;
  requirements: string[];
  concerns: string[];
  confidence: number;
};

function evidenceRef(item: CandidateIntelligenceEvidence): IntelligenceEvidenceRef {
  return {
    id: item.id,
    label: item.label,
    source: item.sourceDocument,
    excerpt: item.sourceExcerpt.trim() || `${item.label} is recorded in ${item.sourceDocument}.`,
    confidence: ["Verified", "Confirmed"].includes(item.evidenceQuality)
      ? "confirmed"
      : "high-level",
  };
}

function projectRef(project: PortfolioInput): IntelligenceEvidenceRef {
  return {
    id: project.id,
    label: project.name,
    source: project.sourceDocument,
    excerpt: `${project.sourceExcerpt.trim() || `${project.name} is recorded as a portfolio project.`} Portfolio readiness: ${project.portfolioReadiness}%.`,
    confidence: ["Verified", "Confirmed"].includes(project.evidenceQuality)
      ? "confirmed"
      : "high-level",
  };
}

function linkedEvidence(item: EvidenceInput) {
  return [
    evidenceRef(item),
    ...(item.resumeLinks ?? []).map((link): IntelligenceEvidenceRef => ({
      id: `resume-${link.resumeEvidence.id}`,
      label: `${link.resumeEvidence.employer}: ${link.resumeEvidence.title}`,
      source: link.resumeEvidence.sourceDocument,
      excerpt: link.sourceExcerpt.trim()
        || `${link.resumeEvidence.employer}: ${link.resumeEvidence.title}`,
      confidence: ["Verified", "Confirmed"].includes(link.evidenceQuality)
        ? "confirmed"
        : "high-level",
    })),
    ...(item.projectLinks ?? []).map((link) => projectRef(link.project)),
  ];
}

function jobEvidence(text: string, keyword: string): IntelligenceEvidenceRef {
  const sentence = text
    .split(/(?<=[.!?])\s+|\n+/)
    .find((value) => value.toLowerCase().includes(keyword.toLowerCase()))
    ?.trim();
  return {
    id: `job-${keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: "Opportunity requirement",
    source: "job description",
    excerpt: sentence?.slice(0, 280) || `The opportunity references ${keyword}.`,
    confidence: "job",
  };
}

function keywords(item: CandidateIntelligenceEvidence) {
  return Array.isArray(item.keywords)
    ? item.keywords.filter((value): value is string => typeof value === "string")
    : [];
}

function guidance(
  title: string,
  explanation: string,
  evidence: IntelligenceEvidenceRef[],
  status: IntelligenceGuidanceItem["status"],
): IntelligenceGuidanceItem {
  return { title, explanation, evidence, status };
}

const GAP_TERMS = [
  { label: "Accessibility", terms: ["accessibility", "wcag", "accessible"] },
  { label: "AI product experience", terms: ["artificial intelligence", "generative ai", "machine learning", " ai "] },
  { label: "Mobile product experience", terms: ["mobile app", "ios", "android"] },
  { label: "Native application experience", terms: ["native app", "native application"] },
  { label: "People leadership", terms: ["people manager", "manage designers", "direct reports", "team leadership"] },
  { label: "Marketplace experience", terms: ["marketplace", "two-sided"] },
] as const;

export function generateOpportunityIntelligence(
  opportunity: OpportunityInput,
  evidence: EvidenceInput[],
  portfolio: PortfolioInput[],
): OpportunityIntelligenceData {
  const text = [
    opportunity.title,
    opportunity.description,
    ...opportunity.requirements,
  ].join("\n").toLowerCase();
  const matches = evidence.flatMap((item) => {
    const matchedKeyword = keywords(item).find((keyword) =>
      text.includes(keyword.toLowerCase()));
    return matchedKeyword ? [{ item, matchedKeyword }] : [];
  }).sort((a, b) => {
    const quality: Record<string, number> = {
      Verified: 1,
      Confirmed: 2,
      Partial: 3,
      Unknown: 4,
      Unsupported: 5,
    };
    const qualityDifference =
      (quality[a.item.evidenceQuality] ?? 5)
      - (quality[b.item.evidenceQuality] ?? 5);
    if (qualityDifference) return qualityDifference;
    const priority: Record<string, number> = {
      skill: 1,
      domain: 2,
      product: 3,
      industry: 4,
      experience: 5,
    };
    return (priority[a.item.category] ?? 9) - (priority[b.item.category] ?? 9);
  });
  const itemFor = (
    match: (typeof matches)[number],
    noun: string,
  ) => guidance(
    match.item.label,
    `${match.item.label} is supported by candidate context and appears in this opportunity's ${noun}.`,
    [...linkedEvidence(match.item), jobEvidence(text, match.matchedKeyword)],
    "supported",
  );
  const matchedSkills = matches
    .filter(({ item }) => ["skill", "experience"].includes(item.category))
    .map((match) => itemFor(match, "requirements"));
  const matchedIndustries = matches
    .filter(({ item }) => item.category === "industry")
    .map((match) => itemFor(match, "industry language"));
  const matchedDomains = matches
    .filter(({ item }) => ["domain", "product"].includes(item.category))
    .map((match) => itemFor(match, "product context"));
  const strengths = [...matchedSkills, ...matchedDomains, ...matchedIndustries].slice(0, 6);

  const gaps = GAP_TERMS.flatMap((gap) => {
    const found = gap.terms.find((term) => text.includes(term));
    const candidateMatch = evidence.find((item) =>
      keywords(item).some((keyword) => gap.terms.some((term) =>
        keyword.includes(term) || term.includes(keyword))));
    return found && !candidateMatch
      ? [guidance(
          gap.label,
          `The opportunity asks for ${gap.label.toLowerCase()}, but the structured candidate profile contains no confirmed evidence for it.`,
          [jobEvidence(text, found.trim())],
          "missing",
        )]
      : [];
  });
  if (!portfolio.some((project) => project.evidenceStatus === "confirmed-project-detail")) {
    gaps.push(guidance(
      "Project-level proof",
      "Known project contexts exist, but responsibilities, outcomes, and capability mappings have not been confirmed.",
      portfolio.slice(0, 2).map(projectRef),
      "missing",
    ));
  }

  const concerns = opportunity.concerns.map((concern) =>
    guidance(
      concern,
      "The certified import pipeline identified this concern. Confirm its impact before advancing.",
      [jobEvidence(concern, concern.slice(0, 40))],
      "concern",
    ));
  const leadershipSignals = text.includes("lead")
    ? [guidance(
        "Leadership scope requires clarification",
        "The opportunity contains leadership language, while the candidate profile explicitly lists leadership examples as missing.",
        [jobEvidence(text, "lead")],
        "missing",
      )]
    : [];
  const focus = strengths[0]?.title ?? "senior product design";
  const opportunityEvidence = [jobEvidence(text, opportunity.title)];
  const portfolioRecommendations = [...portfolio]
    .filter((project) => project.portfolioReadiness > 0)
    .sort((a, b) => b.portfolioReadiness - a.portfolioReadiness)
    .slice(0, 3)
    .map((project) =>
    guidance(
      project.name,
      `${project.name} is ${project.portfolioReadiness}% portfolio-ready and is worth evaluating for the role's ${focus.toLowerCase()} needs. Confirm every unmapped responsibility and outcome before presenting it as proof.`,
      [projectRef(project), ...(strengths[0]?.evidence.slice(1) ?? [])],
      "prepare",
    ));
  const resumeRecommendations = [
    ...strengths.slice(0, 3).map((strength) =>
      guidance(
        `Emphasize ${strength.title}`,
        `Move truthful evidence for ${strength.title.toLowerCase()} higher when tailoring the resume for ${opportunity.company}.`,
        strength.evidence,
        "prepare",
      )),
    ...gaps.slice(0, 2).map((gap) =>
      guidance(
        `Do not add unsupported ${gap.title.toLowerCase()} keywords`,
        "Only add this language if a verified resume or project record can support it; do not keyword-stuff.",
        gap.evidence,
        "missing",
      )),
  ];
  const interviewTopics = [
    ...strengths.slice(0, 3).map((strength) =>
      guidance(
        `Prepare a ${strength.title.toLowerCase()} example`,
        `Choose one concise situation that demonstrates ${strength.title.toLowerCase()} and confirm your exact role before the interview.`,
        strength.evidence,
        "prepare",
      )),
    ...gaps.slice(0, 2).map((gap) =>
      guidance(
        `Prepare an honest response about ${gap.title.toLowerCase()}`,
        "Explain adjacent experience and the evidence gap directly instead of implying unsupported expertise.",
        gap.evidence,
        "prepare",
      )),
  ];
  const preparationChecklist = [
    guidance(
      "Select one primary case study",
      `Validate which known project best demonstrates ${focus.toLowerCase()} for this opportunity.`,
      portfolioRecommendations[0]?.evidence ?? strengths[0]?.evidence ?? opportunityEvidence,
      "prepare",
    ),
    guidance(
      "Tailor the opening resume summary",
      `Lead with the supported ${focus.toLowerCase()} connection, using only verified language.`,
      strengths[0]?.evidence ?? opportunityEvidence,
      "prepare",
    ),
    guidance(
      "Resolve the largest evidence gap",
      gaps[0]
        ? `Confirm whether truthful evidence exists for ${gaps[0].title.toLowerCase()}.`
        : "No explicit capability gap was detected; verify project-level proof.",
      gaps[0]?.evidence
        ?? (portfolio.length ? portfolio.slice(0, 1).map(projectRef) : opportunityEvidence),
      "prepare",
    ),
  ];

  return {
    version: INTELLIGENCE_VERSION,
    topReason: strengths[0]
      ? `Strong ${strengths[0].title.toLowerCase()} fit.`
      : "Role alignment is present, but structured supporting evidence is limited.",
    strengths,
    missingEvidence: gaps,
    concerns,
    confidenceExplanation:
      `The certified confidence remains ${opportunity.confidence}%. Candidate Intelligence found ${strengths.length} supported connections and ${gaps.length} explicit evidence gaps; it does not alter the score or confidence.`,
    matchedSkills,
    matchedIndustries,
    matchedDomains,
    leadershipSignals,
    portfolioRecommendations,
    resumeRecommendations,
    interviewTopics,
    preparationChecklist,
  };
}
