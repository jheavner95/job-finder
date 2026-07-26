import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { statusFromPrisma } from "./status";
import type {
  DashboardSummary,
  JobDetailModel,
  JobListItem,
  ReportSummary,
} from "./view-models";
import type { CategoryResult } from "./types";
import {
  deserializeOpportunityIntelligence,
  ensureOpportunityIntelligence,
} from "./candidate-intelligence/service";

const jobInclude = {
  company: true,
  source: true,
  evaluations: {
    orderBy: { evaluatedAt: "desc" as const },
    take: 1,
    include: { evidence: true },
  },
  decisions: {
    orderBy: { decidedAt: "desc" as const },
    take: 1,
  },
  intelligence: true,
} satisfies Prisma.JobInclude;

type IncludedJob = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

function stringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function categoryResults(value: Prisma.JsonValue): CategoryResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CategoryResult =>
      typeof item === "object" &&
      item !== null &&
      "category" in item &&
      "reason" in item &&
      "contribution" in item,
  );
}

function summaryFromReasoning(value: Prisma.JsonValue): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.summary === "string"
  ) {
    return value.summary;
  }
  return "No automated explanation is available.";
}

function evaluationMetadata(value: Prisma.JsonValue): {
  confidence: number;
  eligibility: "eligible" | "excluded";
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { confidence: 0, eligibility: "eligible" };
  }
  return {
    confidence:
      typeof value.confidence === "number"
        ? Math.max(0, Math.min(100, Math.round(value.confidence)))
        : 0,
    eligibility: value.eligibility === "excluded" ? "excluded" : "eligible",
  };
}

function compensation(job: IncludedJob): string {
  if (job.compensationText) return job.compensationText;
  if (job.compensationMin && job.compensationMax) {
    const currency = job.compensationCurrency ?? "USD";
    return `${currency} ${job.compensationMin.toLocaleString()}–${job.compensationMax.toLocaleString()}`;
  }
  return "Not listed";
}

function postedLabel(date: Date | null): string {
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function currentStatus(job: IncludedJob) {
  return statusFromPrisma[job.decisions[0]?.decision ?? job.status];
}

function toListItem(job: IncludedJob): JobListItem {
  const evaluation = job.evaluations[0];
  const metadata = evaluation
    ? evaluationMetadata(evaluation.reasoning)
    : { confidence: 0, eligibility: "eligible" as const };
  return {
    id: job.id,
    title: job.title,
    company: job.company.name,
    companyInitials: job.company.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    location: job.location ?? "Location unavailable",
    remoteStatus: job.remoteStatus ?? "Work model unavailable",
    employmentType: job.employmentType ?? "Employment type unavailable",
    compensation: compensation(job),
    posted: postedLabel(job.postedAt),
    source: job.source.name,
    status: currentStatus(job),
    score: evaluation?.score ?? 0,
    confidence: metadata.confidence,
    eligibility: metadata.eligibility,
    summary: evaluation
      ? summaryFromReasoning(evaluation.reasoning)
      : "Not yet evaluated.",
    matchReason: job.intelligence?.topReason
      ?? (evaluation ? summaryFromReasoning(evaluation.reasoning) : "Not yet evaluated."),
    concerns: stringArray(job.normalizedConcerns),
    isSynthetic: job.isSynthetic,
  };
}

export async function getJobs(): Promise<JobListItem[]> {
  await ensureOpportunityIntelligence(prisma);
  const jobs = await prisma.job.findMany({
    where: { isSynthetic: false },
    include: jobInclude,
    orderBy: { title: "asc" },
  });
  return jobs.map(toListItem).sort((a, b) => b.score - a.score);
}

export async function getJob(id: string): Promise<JobDetailModel | null> {
  await ensureOpportunityIntelligence(prisma, { jobIds: [id] });
  const job = await prisma.job.findFirst({ where: { id, isSynthetic: false }, include: jobInclude });
  if (!job) return null;
  const evaluation = job.evaluations[0];
  return {
    ...toListItem(job),
    sourceUrl: job.sourceUrl,
    description: job.originalSourceText,
    requirements: stringArray(job.normalizedRequirements),
    companyNotes: job.company.notes ?? "No company notes recorded.",
    categoryResults: evaluation
      ? categoryResults(evaluation.categoryResults)
      : [],
    evidence:
      evaluation?.evidence.map((item) => ({
        id: item.id,
        label: item.label,
        excerpt: item.excerpt,
        relevance: item.relevance,
        contextFile: item.contextFile,
      })) ?? [],
    activity: await prisma.activityEvent
      .findMany({
        where: { jobId: job.id },
        orderBy: { createdAt: "desc" },
      })
      .then((events) =>
        events.map((event) => ({
          id: event.id,
          type: event.type,
          summary: event.summary,
          createdAt: event.createdAt.toISOString(),
        })),
      ),
    intelligence: job.intelligence
      ? deserializeOpportunityIntelligence(job.intelligence)
      : null,
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return { jobs: await getJobs() };
}

export async function getReportSummary(): Promise<ReportSummary> {
  const jobs = await getJobs();
  return {
    total: jobs.length,
    strong: jobs.filter((job) => job.score >= 85).length,
    possible: jobs.filter((job) => job.score >= 50 && job.score < 85).length,
    rejected: jobs.filter((job) => job.score < 50).length,
  };
}
