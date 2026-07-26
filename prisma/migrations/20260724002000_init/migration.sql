-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "JobSource_name_key" ON "JobSource"("name");

CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceJobId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "remoteStatus" TEXT,
    "employmentType" TEXT,
    "compensationMin" INTEGER,
    "compensationMax" INTEGER,
    "compensationCurrency" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "originalSourceText" TEXT NOT NULL,
    "normalizedDescription" TEXT,
    "normalizedRequirements" JSONB,
    "postedAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "companyId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Job_fingerprint_key" ON "Job"("fingerprint");
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");
CREATE INDEX "Job_status_idx" ON "Job"("status");
CREATE INDEX "Job_postedAt_idx" ON "Job"("postedAt");

CREATE TABLE "JobEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "score" INTEGER NOT NULL,
    "reasoning" JSONB NOT NULL,
    "categoryResults" JSONB NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    CONSTRAINT "JobEvaluation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "JobEvaluation_jobId_evaluatedAt_idx" ON "JobEvaluation"("jobId", "evaluatedAt");

CREATE TABLE "CandidateEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contextFile" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluationId" TEXT NOT NULL,
    CONSTRAINT "CandidateEvidence_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "JobEvaluation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "decidedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    CONSTRAINT "UserDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserDecision_jobId_decidedAt_idx" ON "UserDecision"("jobId", "decidedAt");

CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "appliedAt" DATETIME,
    "notes" TEXT,
    "nextStepAt" DATETIME,
    "jobId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT,
    CONSTRAINT "ActivityEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "sourceId" TEXT,
    CONSTRAINT "SearchRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "_JobsInSearchRun" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_JobsInSearchRun_A_fkey" FOREIGN KEY ("A") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_JobsInSearchRun_B_fkey" FOREIGN KEY ("B") REFERENCES "SearchRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "_JobsInSearchRun_AB_unique" ON "_JobsInSearchRun"("A", "B");
CREATE INDEX "_JobsInSearchRun_B_index" ON "_JobsInSearchRun"("B");

CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

