import type { Prisma, PrismaClient } from "@prisma/client";

import { extractResumeEvidence } from "./candidate-intelligence/resume-import";

export const CANDIDATE_ID = "primary-candidate";
export const ONBOARDING_STEPS = [
  "Import Resume",
  "Review Experience",
  "Portfolio Projects",
  "Career Preferences",
  "Finish",
] as const;

export function strings(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function calculateCareerReadiness(input: {
  resumeRecords: number;
  capabilityCoverage: number;
  portfolioReadiness: number;
  preferencesComplete: boolean;
}) {
  return Math.round(
    (input.resumeRecords ? 30 : 0)
    + input.capabilityCoverage * 0.35
    + Math.min(input.portfolioReadiness, 100) * 0.25
    + (input.preferencesComplete ? 10 : 0),
  );
}

export async function getOnboardingState(database: PrismaClient) {
  const profile = await database.candidateProfile.findUnique({
    where: { id: CANDIDATE_ID },
    include: {
      onboarding: true,
      resumeImports: { orderBy: { createdAt: "desc" }, take: 10 },
      resumeEvidence: { orderBy: { startDate: "desc" } },
      resumeReadiness: true,
      portfolio: { orderBy: { name: "asc" } },
      careerPreferences: true,
      projectProgress: true,
    },
  });
  if (!profile) return null;
  const portfolioReadiness = profile.portfolio.length
    ? Math.round(profile.portfolio.reduce((sum, item) => sum + item.portfolioReadiness, 0) / profile.portfolio.length)
    : 0;
  const preferencesComplete = Boolean(
    profile.careerPreferences
    && (
      strings(profile.careerPreferences.preferredRoles).length
      || strings(profile.careerPreferences.preferredIndustries).length
      || profile.careerPreferences.workMode
      || profile.careerPreferences.compensation
      || strings(profile.careerPreferences.companyExclusions).length
      || strings(profile.careerPreferences.employmentTypes).length
    ),
  );
  const readiness = calculateCareerReadiness({
    resumeRecords: profile.resumeEvidence.length,
    capabilityCoverage: profile.resumeReadiness?.capabilityCoverage ?? 0,
    portfolioReadiness,
    preferencesComplete,
  });
  return {
    ...profile,
    portfolioReadiness,
    preferencesComplete,
    readiness,
    shouldShowPrimary: !profile.onboarding?.completedAt
      && (
        profile.resumeEvidence.length === 0
        || portfolioReadiness < 20
        || !profile.onboarding
      ),
  };
}

export async function ensureOnboarding(database: PrismaClient) {
  const state = await getOnboardingState(database);
  if (!state) throw new Error("Candidate profile is not initialized.");
  if (state.onboarding) return state.onboarding;
  return database.candidateOnboarding.create({
    data: {
      id: "primary-onboarding",
      profileId: CANDIDATE_ID,
      baselineReadiness: state.readiness,
    },
  });
}

export function parseResumeText(sourceText: string) {
  return extractResumeEvidence(sourceText);
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round(numerator / denominator * 100) : 0;
}

export async function recalculateResumeEvidence(database: PrismaClient) {
  const [capabilities, resume] = await Promise.all([
    database.candidateIntelligenceEvidence.findMany({
      where: { profileId: CANDIDATE_ID },
      include: { projectLinks: true },
    }),
    database.candidateResumeEvidence.findMany({
      where: { profileId: CANDIDATE_ID },
    }),
  ]);
  await database.candidateCapabilityResumeLink.deleteMany({
    where: { capability: { profileId: CANDIDATE_ID } },
  });
  for (const record of resume) {
    const source = [
      record.employer,
      record.title,
      ...[
        record.responsibilities,
        record.leadership,
        record.domains,
        record.industries,
        record.products,
        record.technologies,
        record.methods,
        record.collaboration,
        record.research,
        record.accessibility,
        record.ai,
        record.designSystems,
        record.enterprise,
      ].flatMap(strings),
    ].join("\n").toLowerCase();
    for (const capability of capabilities) {
      const match = strings(capability.keywords)
        .find((keyword) => source.includes(keyword.toLowerCase()));
      if (!match) continue;
      await database.candidateCapabilityResumeLink.create({
        data: {
          capabilityId: capability.id,
          resumeEvidenceId: record.id,
          supportReason: `${record.employer} explicitly references ${match}.`,
          sourceExcerpt: record.sourceExcerpt,
          evidenceQuality: record.evidenceQuality,
        },
      });
    }
  }
  const refreshed = await database.candidateIntelligenceEvidence.findMany({
    where: { profileId: CANDIDATE_ID },
    include: { resumeLinks: true, projectLinks: true },
  });
  const categories = (category: string) => refreshed.filter((item) => item.category === category);
  const resumeLinked = refreshed.filter((item) => item.resumeLinks.length);
  const readiness = {
    capabilityCoverage: percent(resumeLinked.length, refreshed.length),
    industryCoverage: percent(
      categories("industry").filter((item) => item.resumeLinks.length).length,
      categories("industry").length,
    ),
    domainCoverage: percent(
      categories("domain").filter((item) => item.resumeLinks.length).length,
      categories("domain").length,
    ),
    leadershipCoverage: resume.some((item) => strings(item.leadership).length) ? 100 : 0,
    portfolioSupport: percent(
      refreshed.filter((item) => item.projectLinks.length).length,
      refreshed.length,
    ),
    capabilitiesWithoutResume: refreshed.filter((item) => !item.resumeLinks.length).map((item) => item.label),
    capabilitiesWithoutPortfolio: refreshed.filter((item) => !item.projectLinks.length).map((item) => item.label),
    evidenceDistribution: Object.fromEntries(
      ["Verified", "Confirmed", "Partial", "Unknown", "Unsupported"].map((quality) => [
        quality,
        refreshed.filter((item) => item.evidenceQuality === quality).length
          + resume.filter((item) => item.evidenceQuality === quality).length,
      ]),
    ),
    calculatedAt: new Date(),
  };
  await database.candidateResumeReadiness.upsert({
    where: { profileId: CANDIDATE_ID },
    create: { id: "primary-resume-readiness", profileId: CANDIDATE_ID, ...readiness },
    update: readiness,
  });
  return readiness;
}
