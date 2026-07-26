import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PrismaClient } from "@prisma/client";

const PROFILE_ID = "primary-candidate";

type EvidenceDefinition = {
  id: string;
  category: "experience" | "skill" | "industry" | "domain" | "product";
  label: string;
  sourceDocument: "career-profile.md";
  sourceExcerpt: string;
  keywords: string[];
  confidence: "confirmed" | "high-level";
};

function field(content: string, label: string) {
  return content.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? null;
}

function list(value: string | null) {
  if (!value || /^(unknown|not supplied|none)$/i.test(value)) return [];
  return value.split(/\s*[,;]\s*/).map((item) => item.trim()).filter(Boolean);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

async function readContext(file: string) {
  try {
    return await readFile(join(process.cwd(), "context", file), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return readFile(join(process.cwd(), "context", "example", file), "utf8");
    }
    throw error;
  }
}

function profileEvidence(content: string): EvidenceDefinition[] {
  const strengths = list(field(content, "Confirmed strengths"));
  const industries = list(field(content, "Known industry exposure"));
  const domains = list(field(content, "Known domains"));
  const products = list(field(content, "Known product types"));
  const yearsText = field(content, "Approximate experience");
  const years = yearsText?.match(/\d+/)?.[0];
  return [
    ...(years ? [{
      id: `experience-${years}-years`,
      category: "experience" as const,
      label: `${years} years of experience`,
      sourceDocument: "career-profile.md" as const,
      sourceExcerpt: yearsText!,
      keywords: ["years of experience"],
      confidence: "confirmed" as const,
    }] : []),
    ...strengths.map((label) => ({
      id: `skill-${slug(label)}`,
      category: "skill" as const,
      label,
      sourceDocument: "career-profile.md" as const,
      sourceExcerpt: label,
      keywords: [label.toLowerCase()],
      confidence: "confirmed" as const,
    })),
    ...industries.map((label) => ({
      id: `industry-${slug(label)}`,
      category: "industry" as const,
      label,
      sourceDocument: "career-profile.md" as const,
      sourceExcerpt: label,
      keywords: [label.toLowerCase()],
      confidence: "high-level" as const,
    })),
    ...domains.map((label) => ({
      id: `domain-${slug(label)}`,
      category: "domain" as const,
      label,
      sourceDocument: "career-profile.md" as const,
      sourceExcerpt: label,
      keywords: [label.toLowerCase()],
      confidence: "high-level" as const,
    })),
    ...products.map((label) => ({
      id: `product-${slug(label)}`,
      category: "product" as const,
      label,
      sourceDocument: "career-profile.md" as const,
      sourceExcerpt: label,
      keywords: [label.toLowerCase()],
      confidence: "high-level" as const,
    })),
  ];
}

function portfolioProjects(content: string) {
  const confirmed = content.match(/## Confirmed information\s*([\s\S]*?)(?=\n## |\s*$)/i)?.[1] ?? "";
  return confirmed
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value && !value.includes(":")));
}

export async function syncCandidateProfile(
  database: PrismaClient,
  options: { force?: boolean } = {},
) {
  const [careerProfile, masterResume, portfolioEvidence] = await Promise.all([
    readContext("career-profile.md"),
    readContext("master-resume.md"),
    readContext("portfolio-evidence.md"),
  ]);
  const documents = new Map([
    ["career-profile.md", careerProfile],
    ["master-resume.md", masterResume],
    ["portfolio-evidence.md", portfolioEvidence],
  ]);
  const sourceDates = [...documents.values()].flatMap((content) => {
    const value = content.match(/^last_updated:\s*(\d{4}-\d{2}-\d{2})$/m)?.[1];
    return value ? [new Date(`${value}T00:00:00`)] : [];
  });
  const sourceUpdatedAt = sourceDates.sort(
    (a, b) => b.getTime() - a.getTime(),
  )[0] ?? null;
  const existing = await database.candidateProfile.findUnique({
    where: { id: PROFILE_ID },
    include: {
      evidence: {
        include: {
          projectLinks: { include: { project: true } },
          resumeLinks: { include: { resumeEvidence: true } },
        },
      },
      portfolio: { include: { capabilityLinks: true } },
    },
  });
  if (
    !options.force
    && existing
    && existing.evidence.length > 0
    && existing.sourceUpdatedAt?.getTime() === sourceUpdatedAt?.getTime()
  ) {
    return existing;
  }

  const availableEvidence = profileEvidence(careerProfile);
  const availableProjects = portfolioProjects(portfolioEvidence);
  const candidateName = field(careerProfile, "Candidate") ?? "Candidate";
  const headline = field(careerProfile, "Professional position") ?? "Job seeker";
  const yearsExperience = Number.parseInt(
    field(careerProfile, "Approximate experience")?.match(/\d+/)?.[0] ?? "",
    10,
  );

  await database.$transaction(async (transaction) => {
    await transaction.candidateProfile.upsert({
      where: { id: PROFILE_ID },
      create: {
        id: PROFILE_ID,
        displayName: candidateName,
        headline,
        yearsExperience: Number.isFinite(yearsExperience) ? yearsExperience : null,
        sourceUpdatedAt,
      },
      update: {
        displayName: candidateName,
        headline,
        yearsExperience: Number.isFinite(yearsExperience) ? yearsExperience : null,
        sourceUpdatedAt,
      },
    });
    await transaction.candidateIntelligenceEvidence.deleteMany({
      where: { profileId: PROFILE_ID },
    });
    if (availableEvidence.length) {
      await transaction.candidateIntelligenceEvidence.createMany({
        data: availableEvidence.map((item) => ({
          ...item,
          profileId: PROFILE_ID,
          keywords: item.keywords,
        })),
      });
    }
    for (const name of availableProjects) {
      await transaction.candidatePortfolioProject.upsert({
        where: { profileId_name: { profileId: PROFILE_ID, name } },
        create: {
          id: `portfolio-${slug(name)}`,
          profileId: PROFILE_ID,
          name,
          evidenceStatus: "high-level-context-only",
          sourceDocument: "portfolio-evidence.md",
          sourceExcerpt: `${name} is listed as a project context; responsibilities and outcomes are not yet mapped.`,
        },
        update: {
          sourceDocument: "portfolio-evidence.md",
          sourceExcerpt: `${name} is listed as a project context; responsibilities and outcomes are not yet mapped.`,
        },
      });
    }
    await transaction.candidatePortfolioProject.deleteMany({
      where: {
        profileId: PROFILE_ID,
        name: { notIn: availableProjects },
      },
    });
  });

  return database.candidateProfile.findUniqueOrThrow({
    where: { id: PROFILE_ID },
    include: {
      evidence: {
        include: {
          projectLinks: { include: { project: true } },
          resumeLinks: { include: { resumeEvidence: true } },
        },
      },
      portfolio: { include: { capabilityLinks: true } },
    },
  });
}
