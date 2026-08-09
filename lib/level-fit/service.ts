import type { Prisma, PrismaClient } from "@prisma/client";

import { buildCandidateLevelProfile } from "./candidate-level";
import { extractPostingLevel } from "./posting-level";
import { assessLevelFit } from "./verdict";
import type { CandidateLevelProfile, LevelFitAssessment, LevelFitVerdict, PostingLevel } from "./types";

/** Prisma-facing layer. Detection and verdict stay pure and DB-free. */

type Transactional = Pick<PrismaClient, "jobLevelAssessment">;

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function loadCandidateLevelProfile(
  prisma: Pick<PrismaClient, "candidateProfile">,
): Promise<CandidateLevelProfile> {
  const profile = await prisma.candidateProfile.findFirst({
    select: {
      yearsExperience: true,
      careerPreferences: { select: { preferredRoles: true, trackPreference: true } },
      resumeEvidence: { select: { title: true, startDate: true, endDate: true } },
    },
  });
  return buildCandidateLevelProfile({
    yearsExperience: profile?.yearsExperience ?? null,
    preferredRoles: stringArray(profile?.careerPreferences?.preferredRoles),
    resumeRoles: profile?.resumeEvidence ?? [],
    trackPreference: profile?.careerPreferences?.trackPreference ?? null,
  });
}

export type AssessableJob = {
  id: string;
  title: string;
  normalizedDescription: string | null;
  originalSourceText: string;
  normalizedRequirements: Prisma.JsonValue;
};

export function assessJobLevel(
  job: AssessableJob,
  profile: CandidateLevelProfile,
  now = new Date(),
): LevelFitAssessment {
  const posting = extractPostingLevel({
    title: job.title,
    description: job.normalizedDescription ?? job.originalSourceText,
    requirements: stringArray(job.normalizedRequirements),
  });
  return assessLevelFit(posting, profile, now);
}

export async function persistLevelAssessment(
  client: Transactional,
  jobId: string,
  assessment: LevelFitAssessment,
) {
  const data = {
    verdict: assessment.verdict,
    headline: assessment.headline,
    postingLevel: assessment.posting.level,
    postingTrack: assessment.posting.track,
    posting: assessment.posting as unknown as Prisma.InputJsonValue,
    detectorVersion: assessment.detectorVersion,
    assessedAt: new Date(assessment.assessedAt),
  };
  await client.jobLevelAssessment.upsert({
    where: { jobId },
    create: { jobId, ...data },
    update: data,
  });
}

/**
 * Re-derive every job's level verdict.
 *
 * Reads and writes only `JobLevelAssessment`. Never touches jobs, evaluations,
 * scores, eligibility, connectors, or discovery state.
 */
export async function reassessAllLevels(
  prisma: PrismaClient,
  options: { batchSize?: number } = {},
): Promise<Record<LevelFitVerdict, number> & { total: number }> {
  const batchSize = options.batchSize ?? 100;
  const profile = await loadCandidateLevelProfile(prisma);
  const counts = {
    total: 0,
    IDEAL: 0,
    COMPATIBLE: 0,
    STRETCH: 0,
    TOO_JUNIOR: 0,
    TOO_SENIOR: 0,
    TRACK_MISMATCH: 0,
    REVIEW_REQUIRED: 0,
    UNKNOWN: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const jobs = await prisma.job.findMany({
      where: { isSynthetic: false },
      select: {
        id: true,
        title: true,
        normalizedDescription: true,
        originalSourceText: true,
        normalizedRequirements: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!jobs.length) break;

    for (const job of jobs) {
      const assessment = assessJobLevel(job, profile);
      await persistLevelAssessment(prisma, job.id, assessment);
      counts[assessment.verdict] += 1;
      counts.total += 1;
    }
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < batchSize) break;
  }

  return counts;
}

export function parseStoredPostingLevel(value: Prisma.JsonValue): PostingLevel | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as unknown as PostingLevel)
    : null;
}
