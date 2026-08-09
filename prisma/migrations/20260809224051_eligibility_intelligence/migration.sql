-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN "eligibilityFacts" JSONB;

-- CreateTable
CREATE TABLE "JobEligibilityAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "verdict" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "detectorVersion" TEXT NOT NULL,
    "candidateFactsUpdatedAt" DATETIME,
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    CONSTRAINT "JobEligibilityAssessment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobEligibilityAssessment_jobId_key" ON "JobEligibilityAssessment"("jobId");

-- CreateIndex
CREATE INDEX "JobEligibilityAssessment_verdict_idx" ON "JobEligibilityAssessment"("verdict");
