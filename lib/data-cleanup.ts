import type { PrismaClient } from "@prisma/client";

export type CleanupCategory =
  | "proven-synthetic"
  | "review-required"
  | "private-local";

export type CleanupCandidate = {
  model: string;
  id: string;
  label: string;
  category: CleanupCategory;
  reason: string;
};

export type DataAudit = {
  generatedAt: string;
  counts: Record<string, number>;
  candidates: CleanupCandidate[];
  removable: number;
  reviewRequired: number;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fixtureSource(value: string) {
  return value.startsWith("context/example/")
    || value.startsWith("dev/fixtures/")
    || value.startsWith("demo/fixtures/")
    || value.startsWith("tests/fixtures/");
}

export async function auditLocalData(database: PrismaClient): Promise<DataAudit> {
  const [
    jobs,
    reports,
    notifications,
    connectors,
    projects,
    resumeEvidence,
    evidence,
    counts,
  ] = await Promise.all([
    database.job.findMany({ include: { company: true, source: true } }),
    database.report.findMany(),
    database.notification.findMany(),
    database.companyConnector.findMany(),
    database.candidatePortfolioProject.findMany(),
    database.candidateResumeEvidence.findMany(),
    database.candidateIntelligenceEvidence.findMany(),
    Promise.all([
      database.job.count(),
      database.application.count(),
      database.candidatePortfolioProject.count(),
      database.candidateResumeImport.count(),
      database.candidateResumeEvidence.count(),
      database.candidateIntelligenceEvidence.count(),
      database.notification.count(),
      database.discoveryBatch.count(),
      database.companyConnector.count(),
      database.report.count(),
    ]),
  ]);
  const candidates: CleanupCandidate[] = [];
  for (const job of jobs) {
    if (job.isSynthetic) {
      candidates.push({
        model: "Job",
        id: job.id,
        label: `${job.title} — ${job.company.name}`,
        category: "proven-synthetic",
        reason: "The persisted isSynthetic provenance flag is true.",
      });
    }
  }
  for (const report of reports) {
    const content = JSON.stringify(report.content).toLowerCase();
    if (/\b(fixture|synthetic|demo)\b/.test(`${report.type} ${report.title} ${content}`.toLowerCase())) {
      candidates.push({
        model: "Report",
        id: report.id,
        label: report.title,
        category: "proven-synthetic",
        reason: "The report explicitly identifies itself as fixture, synthetic, or demo content.",
      });
    }
  }
  for (const notification of notifications) {
    const metadata = jsonRecord(notification.metadata);
    if (metadata.fixture === true || metadata.demo === true || metadata.synthetic === true) {
      candidates.push({
        model: "Notification",
        id: notification.id,
        label: notification.title,
        category: "proven-synthetic",
        reason: "Notification metadata explicitly marks this record as fixture, demo, or synthetic.",
      });
    }
  }
  for (const connector of connectors) {
    if (/^(fixture|demo|sample):/i.test(connector.notes ?? "")) {
      candidates.push({
        model: "CompanyConnector",
        id: connector.id,
        label: connector.company,
        category: "proven-synthetic",
        reason: "Connector notes carry an explicit fixture, demo, or sample provenance prefix.",
      });
    }
  }
  for (const project of projects) {
    if (fixtureSource(project.sourceDocument)) {
      candidates.push({
        model: "CandidatePortfolioProject",
        id: project.id,
        label: project.name,
        category: "proven-synthetic",
        reason: `The project source is an isolated fixture path: ${project.sourceDocument}.`,
      });
    } else if (!project.sourceDocument || project.sourceDocument === "portfolio-evidence.md") {
      candidates.push({
        model: "CandidatePortfolioProject",
        id: project.id,
        label: project.name,
        category: "review-required",
        reason: "This may be private local evidence; provenance does not prove it is synthetic.",
      });
    }
  }
  for (const record of resumeEvidence) {
    if (fixtureSource(record.sourceDocument)) {
      candidates.push({
        model: "CandidateResumeEvidence",
        id: record.id,
        label: `${record.employer} — ${record.title}`,
        category: "proven-synthetic",
        reason: `The resume evidence source is an isolated fixture path: ${record.sourceDocument}.`,
      });
    }
  }
  for (const item of evidence) {
    if (fixtureSource(item.sourceDocument)) {
      candidates.push({
        model: "CandidateIntelligenceEvidence",
        id: item.id,
        label: item.label,
        category: "proven-synthetic",
        reason: `The evidence source is an isolated fixture path: ${item.sourceDocument}.`,
      });
    }
  }
  const names = [
    "opportunities",
    "applications",
    "portfolioProjects",
    "resumeImports",
    "resumeEvidence",
    "candidateEvidence",
    "notifications",
    "discoveryHistory",
    "connectors",
    "reports",
  ];
  return {
    generatedAt: new Date().toISOString(),
    counts: Object.fromEntries(names.map((name, index) => [name, counts[index]])),
    candidates,
    removable: candidates.filter((item) => item.category === "proven-synthetic").length,
    reviewRequired: candidates.filter((item) => item.category === "review-required").length,
  };
}

export async function cleanupLocalData(database: PrismaClient, apply: boolean) {
  const audit = await auditLocalData(database);
  if (!apply) return { mode: "dry-run" as const, audit, removed: [] as CleanupCandidate[] };
  const removable = audit.candidates.filter((item) => item.category === "proven-synthetic");
  await database.$transaction(async (transaction) => {
    const ids = (model: string) => removable.filter((item) => item.model === model).map((item) => item.id);
    if (ids("Job").length) await transaction.job.deleteMany({ where: { id: { in: ids("Job") } } });
    if (ids("Report").length) await transaction.report.deleteMany({ where: { id: { in: ids("Report") } } });
    if (ids("Notification").length) await transaction.notification.deleteMany({ where: { id: { in: ids("Notification") } } });
    if (ids("CompanyConnector").length) await transaction.companyConnector.deleteMany({ where: { id: { in: ids("CompanyConnector") } } });
    if (ids("CandidatePortfolioProject").length) await transaction.candidatePortfolioProject.deleteMany({ where: { id: { in: ids("CandidatePortfolioProject") } } });
    if (ids("CandidateResumeEvidence").length) await transaction.candidateResumeEvidence.deleteMany({ where: { id: { in: ids("CandidateResumeEvidence") } } });
    if (ids("CandidateIntelligenceEvidence").length) await transaction.candidateIntelligenceEvidence.deleteMany({ where: { id: { in: ids("CandidateIntelligenceEvidence") } } });
    await transaction.company.deleteMany({ where: { jobs: { none: {} }, notes: { contains: "Synthetic company" } } });
    await transaction.jobSource.deleteMany({ where: { jobs: { none: {} }, name: { contains: "Fixture" } } });
  });
  return { mode: "apply" as const, audit, removed: removable };
}
