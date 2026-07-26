CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "yearsExperience" INTEGER,
    "sourceUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CandidateIntelligenceEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "projectName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "CandidateIntelligenceEvidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CandidateIntelligenceEvidence_profileId_category_idx" ON "CandidateIntelligenceEvidence"("profileId", "category");
CREATE INDEX "CandidateIntelligenceEvidence_label_idx" ON "CandidateIntelligenceEvidence"("label");

CREATE TABLE "CandidatePortfolioProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "evidenceStatus" TEXT NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "CandidatePortfolioProject_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CandidatePortfolioProject_profileId_name_key" ON "CandidatePortfolioProject"("profileId", "name");

CREATE TABLE "OpportunityIntelligence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "topReason" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "missingEvidence" JSONB NOT NULL,
    "concerns" JSONB NOT NULL,
    "confidenceExplanation" TEXT NOT NULL,
    "matchedSkills" JSONB NOT NULL,
    "matchedIndustries" JSONB NOT NULL,
    "matchedDomains" JSONB NOT NULL,
    "leadershipSignals" JSONB NOT NULL,
    "portfolioRecommendations" JSONB NOT NULL,
    "resumeRecommendations" JSONB NOT NULL,
    "interviewTopics" JSONB NOT NULL,
    "preparationChecklist" JSONB NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "jobId" TEXT NOT NULL,
    CONSTRAINT "OpportunityIntelligence_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OpportunityIntelligence_jobId_key" ON "OpportunityIntelligence"("jobId");
CREATE INDEX "OpportunityIntelligence_generatedAt_idx" ON "OpportunityIntelligence"("generatedAt");
