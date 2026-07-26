import type { Prisma, PrismaClient } from "@prisma/client";

import { generateOpportunityIntelligence, INTELLIGENCE_VERSION } from "./engine";
import { syncCandidateProfile } from "./profile-sync";
import type {
  IntelligenceGuidanceItem,
  OpportunityIntelligenceData,
} from "./types";

function stringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function confidence(value: Prisma.JsonValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return typeof value.confidence === "number" ? value.confidence : 0;
}

export async function ensureOpportunityIntelligence(
  database: PrismaClient,
  options: { jobIds?: string[]; force?: boolean } = {},
) {
  const jobCount = await database.job.count({
    where: {
      isSynthetic: false,
      id: options.jobIds?.length ? { in: options.jobIds } : undefined,
    },
  });
  if (jobCount === 0) return { jobs: 0, generated: 0 };
  // Regenerating opportunity guidance must not replace enriched candidate
  // evidence. Profile synchronization is independently idempotent.
  const profile = await syncCandidateProfile(database);
  const jobs = await database.job.findMany({
    where: {
      isSynthetic: false,
      id: options.jobIds?.length ? { in: options.jobIds } : undefined,
    },
    include: {
      intelligence: true,
      company: true,
      evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1 },
    },
  });
  let generated = 0;
  for (const job of jobs) {
    if (
      !options.force
      && job.intelligence?.version === INTELLIGENCE_VERSION
    ) {
      continue;
    }
    const data = generateOpportunityIntelligence({
      title: job.title,
      company: job.company.name,
      description: job.normalizedDescription ?? job.originalSourceText,
      requirements: stringArray(job.normalizedRequirements),
      concerns: stringArray(job.normalizedConcerns),
      confidence: confidence(job.evaluations[0]?.reasoning),
    }, profile.evidence, profile.portfolio);
    const intelligenceData = {
      version: data.version,
      topReason: data.topReason,
      strengths: data.strengths as unknown as Prisma.InputJsonValue,
      missingEvidence: data.missingEvidence as unknown as Prisma.InputJsonValue,
      concerns: data.concerns as unknown as Prisma.InputJsonValue,
      confidenceExplanation: data.confidenceExplanation,
      matchedSkills: data.matchedSkills as unknown as Prisma.InputJsonValue,
      matchedIndustries: data.matchedIndustries as unknown as Prisma.InputJsonValue,
      matchedDomains: data.matchedDomains as unknown as Prisma.InputJsonValue,
      leadershipSignals: data.leadershipSignals as unknown as Prisma.InputJsonValue,
      portfolioRecommendations: data.portfolioRecommendations as unknown as Prisma.InputJsonValue,
      resumeRecommendations: data.resumeRecommendations as unknown as Prisma.InputJsonValue,
      interviewTopics: data.interviewTopics as unknown as Prisma.InputJsonValue,
      preparationChecklist: data.preparationChecklist as unknown as Prisma.InputJsonValue,
    };
    await database.opportunityIntelligence.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, ...intelligenceData },
      update: intelligenceData,
    });
    generated += 1;
  }
  return { jobs: jobs.length, generated };
}

function guidanceItems(value: Prisma.JsonValue): IntelligenceGuidanceItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is IntelligenceGuidanceItem => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return (
      typeof item.title === "string"
      && typeof item.explanation === "string"
      && typeof item.status === "string"
      && Array.isArray(item.evidence)
    );
  });
}

export function deserializeOpportunityIntelligence(value: {
  version: string;
  topReason: string;
  strengths: Prisma.JsonValue;
  missingEvidence: Prisma.JsonValue;
  concerns: Prisma.JsonValue;
  confidenceExplanation: string;
  matchedSkills: Prisma.JsonValue;
  matchedIndustries: Prisma.JsonValue;
  matchedDomains: Prisma.JsonValue;
  leadershipSignals: Prisma.JsonValue;
  portfolioRecommendations: Prisma.JsonValue;
  resumeRecommendations: Prisma.JsonValue;
  interviewTopics: Prisma.JsonValue;
  preparationChecklist: Prisma.JsonValue;
}): OpportunityIntelligenceData {
  return {
    version: value.version,
    topReason: value.topReason,
    strengths: guidanceItems(value.strengths),
    missingEvidence: guidanceItems(value.missingEvidence),
    concerns: guidanceItems(value.concerns),
    confidenceExplanation: value.confidenceExplanation,
    matchedSkills: guidanceItems(value.matchedSkills),
    matchedIndustries: guidanceItems(value.matchedIndustries),
    matchedDomains: guidanceItems(value.matchedDomains),
    leadershipSignals: guidanceItems(value.leadershipSignals),
    portfolioRecommendations: guidanceItems(value.portfolioRecommendations),
    resumeRecommendations: guidanceItems(value.resumeRecommendations),
    interviewTopics: guidanceItems(value.interviewTopics),
    preparationChecklist: guidanceItems(value.preparationChecklist),
  };
}
