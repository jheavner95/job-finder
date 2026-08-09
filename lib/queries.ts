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
import { normalizePostingContent, plainPostingText } from "./job-content";
import {
  type Tiered,
  compareByTier,
  isReviewable,
  resolveTier,
} from "./opportunity-tiers";

/** A list item carrying the opportunity tier derived at evaluation time. */
export type TieredJobListItem = Tiered<JobListItem>;
export type TieredJobDetailModel = Tiered<JobDetailModel>;

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

function ageLabel(date: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "Just imported" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function verification(job: IncludedJob) {
  const closed = Boolean(job.closedAt) || currentStatus(job) === "Closed";
  const ageDays = Math.floor((Date.now() - job.lastSeenAt.getTime()) / 86_400_000);
  return {
    label: closed ? "Posting Closed" : ageDays <= 0 ? "Verified Today" : ageDays === 1 ? "Verified Yesterday" : "Needs Verification",
    tone: closed ? "closed" as const : ageDays <= 1 ? "verified" as const : "warning" as const,
    importedAt: job.firstSeenAt.toISOString(),
    lastVerifiedAt: job.lastSeenAt.toISOString(),
    importAge: ageLabel(job.firstSeenAt),
    officialAts: job.source.name === "Manual import" ? "Manual import" : job.source.name,
  };
}

function clean(value: string) {
  return plainPostingText(value);
}

function toListItem(job: IncludedJob): TieredJobListItem {
  const evaluation = job.evaluations[0];
  const metadata = evaluation
    ? evaluationMetadata(evaluation.reasoning)
    : { confidence: 0, eligibility: "eligible" as const };
  const score = evaluation?.score ?? 0;
  return {
    tier: resolveTier(score, evaluation?.reasoning),
    id: job.id,
    title: clean(job.title),
    company: clean(job.company.name),
    companyInitials: job.company.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    location: job.location ? clean(job.location) : "Location unavailable",
    remoteStatus: job.remoteStatus ?? "Work model unavailable",
    employmentType: job.employmentType ?? "Employment type unavailable",
    compensation: compensation(job),
    posted: postedLabel(job.postedAt),
    source: job.source.name,
    sourceUrl: job.sourceUrl,
    verification: verification(job),
    status: currentStatus(job),
    score,
    confidence: metadata.confidence,
    eligibility: metadata.eligibility,
    summary: evaluation
      ? summaryFromReasoning(evaluation.reasoning)
      : "Not yet evaluated.",
    matchReason: clean(job.intelligence?.topReason
      ?? (evaluation ? summaryFromReasoning(evaluation.reasoning) : "Not yet evaluated.")),
    concerns: stringArray(job.normalizedConcerns).map(clean),
    isSynthetic: job.isSynthetic,
  };
}

/**
 * Every non-synthetic opportunity, carrying its tier so callers can filter and
 * sort by relevance band. Sorted by tier rank first, then score descending.
 */
export async function getJobs(): Promise<TieredJobListItem[]> {
  await ensureOpportunityIntelligence(prisma);
  const jobs = await prisma.job.findMany({
    where: { isSynthetic: false },
    include: jobInclude,
    orderBy: { title: "asc" },
  });
  return jobs.map(toListItem).sort(compareByTier);
}

export async function getJob(id: string): Promise<TieredJobDetailModel | null> {
  await ensureOpportunityIntelligence(prisma, { jobIds: [id] });
  const job = await prisma.job.findFirst({ where: { id, isSynthetic: false }, include: jobInclude });
  if (!job) return null;
  const evaluation = job.evaluations[0];
  const events = await prisma.activityEvent.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
  });
  const duplicateImports = events.filter((event) => event.type === "duplicate_import").length;
  const metadataObject = (value: Prisma.JsonValue | null) =>
    typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  return {
    ...toListItem(job),
    provenance: {
      discoveryMethod: job.sourceJobId ? "Public ATS discovery" : job.source.name === "Manual import" ? "Manual import" : "Certified connector import",
      canonicalUrl: job.sourceUrl,
      duplicateImports,
      availability: job.closedAt || currentStatus(job) === "Closed" ? "Closed" : "Active",
    },
    originalPosting: {
      title: clean(job.title),
      company: clean(job.company.name),
      location: job.location ? clean(job.location) : "Not listed",
      employmentType: job.employmentType ? clean(job.employmentType) : "Not listed",
      compensation: compensation(job),
      remoteStatus: job.remoteStatus ? clean(job.remoteStatus) : "Not listed",
      description: normalizePostingContent(job.originalSourceText),
    },
    description: normalizePostingContent(job.originalSourceText),
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
    activity: events.map((event) => {
          const metadata = metadataObject(event.metadata);
          const changes = Array.isArray(metadata.changes) ? metadata.changes : [];
          return {
          id: event.id,
          type: event.type,
          summary: event.summary,
          source: typeof metadata.source === "string" ? metadata.source : job.source.name,
          createdAt: event.createdAt.toISOString(),
          changes: changes.flatMap((change) => {
            if (typeof change !== "object" || change === null || Array.isArray(change)) return [];
            return [{
              field: typeof change.field === "string" ? change.field : "Posting",
              before: typeof change.before === "string" ? clean(change.before) : "Not listed",
              after: typeof change.after === "string" ? clean(change.after) : "Not listed",
            }];
          }),
        };
      }),
    intelligence: job.intelligence
      ? deserializeOpportunityIntelligence(job.intelligence)
      : null,
  };
}

/** Structurally a {@link DashboardSummary}, with the tier preserved. */
export type TieredDashboardSummary = DashboardSummary & {
  jobs: TieredJobListItem[];
};

export async function getDashboardSummary(): Promise<TieredDashboardSummary> {
  return { jobs: await getJobs() };
}

export async function getReportSummary(): Promise<ReportSummary> {
  const jobs = await getJobs();
  const count = (predicate: (job: TieredJobListItem) => boolean) =>
    jobs.filter(predicate).length;
  return {
    total: jobs.length,
    strong: count(
      (job) => job.tier === "Excellent Fit" || job.tier === "Strong Fit",
    ),
    possible: count(
      (job) => job.tier === "Worth Reviewing" || job.tier === "Stretch",
    ),
    rejected: count((job) => !isReviewable(job.tier)),
  };
}
