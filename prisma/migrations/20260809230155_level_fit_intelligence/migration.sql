-- AlterTable
ALTER TABLE "CandidateCareerPreferences" ADD COLUMN "trackPreference" TEXT;

-- CreateTable
CREATE TABLE "JobLevelAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "verdict" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "postingLevel" TEXT NOT NULL,
    "postingTrack" TEXT NOT NULL,
    "posting" JSONB NOT NULL,
    "detectorVersion" TEXT NOT NULL,
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    CONSTRAINT "JobLevelAssessment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobLevelAssessment_jobId_key" ON "JobLevelAssessment"("jobId");

-- CreateIndex
CREATE INDEX "JobLevelAssessment_verdict_idx" ON "JobLevelAssessment"("verdict");

-- CreateIndex
CREATE INDEX "JobLevelAssessment_postingLevel_idx" ON "JobLevelAssessment"("postingLevel");
