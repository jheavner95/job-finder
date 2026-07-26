import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Prisma, PrismaClient } from "@prisma/client";

import { ensureOpportunityIntelligence } from "./service";
import { syncCandidateProfile } from "./profile-sync";
import { calculatePortfolioReadiness } from "./readiness";
import { extractResumeEvidence } from "./resume-import";

const PROFILE_ID = "primary-candidate";

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round(numerator / denominator * 100) : 0;
}

export async function completeCandidateEvidence(database: PrismaClient) {
  await syncCandidateProfile(database, { force: true });
  const resumeMarkdown = await readFile(
    join(process.cwd(), "context", "master-resume.md"),
    "utf8",
  );
  const resumeRecords = extractResumeEvidence(resumeMarkdown);
  const projects = await database.candidatePortfolioProject.findMany({
    where: { profileId: PROFILE_ID },
  });

  await database.$transaction(async (transaction) => {
    await transaction.candidateCapabilityProjectLink.deleteMany({
      where: { capability: { profileId: PROFILE_ID } },
    });
    await transaction.candidateCapabilityResumeLink.deleteMany({
      where: { capability: { profileId: PROFILE_ID } },
    });
    await transaction.candidateResumeEvidence.deleteMany({
      where: { profileId: PROFILE_ID },
    });
    const structuredCapabilities = await transaction.candidateIntelligenceEvidence.findMany({
      where: { profileId: PROFILE_ID },
    });
    for (const project of projects) {
      const evidenceQuality = project.evidenceQuality === "Unknown"
        ? "Partial"
        : project.evidenceQuality as "Verified" | "Confirmed" | "Partial" | "Unsupported";
      const readiness = calculatePortfolioReadiness({
        ...project,
        evidenceQuality,
      });
      await transaction.candidatePortfolioProject.update({
        where: { id: project.id },
        data: {
          responsibilities: project.responsibilities ?? [],
          crossFunctionalPartners: project.crossFunctionalPartners ?? [],
          artifactsAvailable: project.artifactsAvailable ?? [],
          evidenceQuality,
          ...readiness,
        },
      });
      const projectText = [
        project.employer,
        project.role,
        ...(Array.isArray(project.responsibilities)
          ? project.responsibilities.filter((item): item is string => typeof item === "string")
          : []),
        project.problem,
        project.solution,
        project.businessOutcome,
        project.designOutcome,
        project.researchPerformed,
        project.leadershipDemonstrated,
        ...(Array.isArray(project.crossFunctionalPartners)
          ? project.crossFunctionalPartners.filter((item): item is string => typeof item === "string")
          : []),
        project.industry,
        project.productType,
        project.platform,
        project.enterpriseScale,
        project.designSystemUsage,
        project.accessibilityWork,
        project.aiUsage,
      ].filter((item): item is string => typeof item === "string").join("\n").toLowerCase();
      for (const capability of structuredCapabilities) {
        const capabilityKeywords = Array.isArray(capability.keywords)
          ? capability.keywords.filter((item): item is string => typeof item === "string")
          : [];
        const matched = capabilityKeywords.find((keyword) =>
          projectText.includes(keyword.toLowerCase()));
        if (!matched) continue;
        await transaction.candidateCapabilityProjectLink.create({
          data: {
            capabilityId: capability.id,
            projectId: project.id,
            supportReason: `${project.name} explicitly references ${matched}.`,
            sourceExcerpt: project.sourceExcerpt,
            evidenceQuality,
          },
        });
      }
    }
    if (resumeRecords.length) {
      await transaction.candidateResumeEvidence.createMany({
        data: resumeRecords.map((record) => ({
          ...record,
          profileId: PROFILE_ID,
          responsibilities: record.responsibilities,
          leadership: record.leadership,
          domains: record.domains,
          industries: record.industries,
          products: record.products,
          technologies: record.technologies,
          methods: record.methods,
          collaboration: record.collaboration,
          research: record.research,
          accessibility: record.accessibility,
          ai: record.ai,
          designSystems: record.designSystems,
          enterprise: record.enterprise,
        })),
      });
      const [createdResume, capabilities] = await Promise.all([
        transaction.candidateResumeEvidence.findMany({
          where: { profileId: PROFILE_ID },
        }),
        transaction.candidateIntelligenceEvidence.findMany({
          where: { profileId: PROFILE_ID },
        }),
      ]);
      for (const record of createdResume) {
        const explicitText = [
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
          ].flatMap((value) =>
            Array.isArray(value)
              ? value.filter((item): item is string => typeof item === "string")
              : []),
        ].join("\n").toLowerCase();
        for (const capability of capabilities) {
          const capabilityKeywords = Array.isArray(capability.keywords)
            ? capability.keywords.filter((item): item is string => typeof item === "string")
            : [];
          const matched = capabilityKeywords.find((keyword) =>
            explicitText.includes(keyword.toLowerCase()));
          if (!matched) continue;
          await transaction.candidateCapabilityResumeLink.create({
            data: {
              capabilityId: capability.id,
              resumeEvidenceId: record.id,
              supportReason: `${record.employer} explicitly references ${matched}.`,
              sourceExcerpt: record.sourceExcerpt,
              evidenceQuality: record.evidenceQuality,
            },
          });
        }
      }
    }
    await transaction.candidateIntelligenceEvidence.updateMany({
      where: { profileId: PROFILE_ID, confidence: "confirmed" },
      data: { evidenceQuality: "Confirmed" },
    });
    await transaction.candidateIntelligenceEvidence.updateMany({
      where: { profileId: PROFILE_ID, confidence: "high-level" },
      data: { evidenceQuality: "Partial" },
    });
  });

  const [capabilities, resume, completedProjects] = await Promise.all([
    database.candidateIntelligenceEvidence.findMany({
      where: { profileId: PROFILE_ID },
      include: {
        projectLinks: {
          where: { project: { archivedAt: null } },
        },
        resumeLinks: true,
      },
    }),
    database.candidateResumeEvidence.findMany({
      where: { profileId: PROFILE_ID },
    }),
    database.candidatePortfolioProject.findMany({
      where: { profileId: PROFILE_ID, archivedAt: null },
    }),
  ]);
  const categories = (category: string) =>
    capabilities.filter((item) => item.category === category);
  const resumeLinked = capabilities.filter((item) => item.resumeLinks.length);
  const portfolioLinked = capabilities.filter((item) => item.projectLinks.length);
  const qualityValues = [
    ...capabilities.map((item) => item.evidenceQuality),
    ...completedProjects.map((item) => item.evidenceQuality),
    ...resume.map((item) => item.evidenceQuality),
  ];
  const hasLeadershipEvidence = resume.some((item) =>
    Array.isArray(item.leadership) && item.leadership.length > 0);
  const distribution = Object.fromEntries(
    ["Verified", "Confirmed", "Partial", "Unknown", "Unsupported"].map(
      (quality) => [quality, qualityValues.filter((value) => value === quality).length],
    ),
  );
  const readinessData = {
    capabilityCoverage: percent(resumeLinked.length, capabilities.length),
    industryCoverage: percent(
      categories("industry").filter((item) => item.resumeLinks.length).length,
      categories("industry").length,
    ),
    domainCoverage: percent(
      categories("domain").filter((item) => item.resumeLinks.length).length,
      categories("domain").length,
    ),
    leadershipCoverage: hasLeadershipEvidence ? 100 : 0,
    portfolioSupport: percent(portfolioLinked.length, capabilities.length),
    capabilitiesWithoutResume: capabilities
      .filter((item) => !item.resumeLinks.length)
      .map((item) => item.label) as unknown as Prisma.InputJsonValue,
    capabilitiesWithoutPortfolio: capabilities
      .filter((item) => !item.projectLinks.length)
      .map((item) => item.label) as unknown as Prisma.InputJsonValue,
    evidenceDistribution: distribution,
    calculatedAt: new Date(),
  };
  await database.candidateResumeReadiness.upsert({
    where: { profileId: PROFILE_ID },
    create: { id: "primary-resume-readiness", profileId: PROFILE_ID, ...readinessData },
    update: readinessData,
  });

  const intelligence = await ensureOpportunityIntelligence(database, { force: true });
  return {
    resumeRecords: resume.length,
    portfolioProjects: completedProjects.length,
    capabilityLinks: {
      resume: resumeLinked.length,
      portfolio: portfolioLinked.length,
    },
    evidenceDistribution: distribution,
    intelligence,
  };
}
