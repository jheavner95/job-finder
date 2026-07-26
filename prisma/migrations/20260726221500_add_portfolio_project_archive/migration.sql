ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "archivedAt" DATETIME;

CREATE INDEX "CandidatePortfolioProject_profileId_archivedAt_idx"
ON "CandidatePortfolioProject"("profileId", "archivedAt");
