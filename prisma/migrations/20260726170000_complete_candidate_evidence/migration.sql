ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "employer" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "timeframe" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "role" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "responsibilities" JSONB;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "problem" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "solution" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "businessOutcome" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "designOutcome" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "researchPerformed" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "leadershipDemonstrated" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "crossFunctionalPartners" JSONB;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "industry" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "productType" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "platform" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "enterpriseScale" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "designSystemUsage" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "accessibilityWork" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "aiUsage" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "artifactsAvailable" JSONB;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "confidentiality" TEXT;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "evidenceQuality" TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "documentationCompleteness" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "visualEvidenceReadiness" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "outcomeEvidenceReadiness" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "interviewReadiness" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "portfolioReadiness" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CandidatePortfolioProject" ADD COLUMN "confidence" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CandidateResumeEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "responsibilities" JSONB NOT NULL,
    "leadership" JSONB NOT NULL,
    "domains" JSONB NOT NULL,
    "industries" JSONB NOT NULL,
    "products" JSONB NOT NULL,
    "technologies" JSONB NOT NULL,
    "methods" JSONB NOT NULL,
    "collaboration" JSONB NOT NULL,
    "research" JSONB NOT NULL,
    "accessibility" JSONB NOT NULL,
    "ai" JSONB NOT NULL,
    "designSystems" JSONB NOT NULL,
    "enterprise" JSONB NOT NULL,
    "sourceDocument" TEXT NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "evidenceQuality" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "CandidateResumeEvidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CandidateResumeEvidence_profileId_employer_idx" ON "CandidateResumeEvidence"("profileId", "employer");

CREATE TABLE "CandidateCapabilityProjectLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportReason" TEXT NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "evidenceQuality" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capabilityId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "CandidateCapabilityProjectLink_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "CandidateIntelligenceEvidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateCapabilityProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CandidatePortfolioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CandidateCapabilityProjectLink_capabilityId_projectId_key" ON "CandidateCapabilityProjectLink"("capabilityId", "projectId");
CREATE INDEX "CandidateCapabilityProjectLink_projectId_idx" ON "CandidateCapabilityProjectLink"("projectId");

CREATE TABLE "CandidateCapabilityResumeLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supportReason" TEXT NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "evidenceQuality" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capabilityId" TEXT NOT NULL,
    "resumeEvidenceId" TEXT NOT NULL,
    CONSTRAINT "CandidateCapabilityResumeLink_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "CandidateIntelligenceEvidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateCapabilityResumeLink_resumeEvidenceId_fkey" FOREIGN KEY ("resumeEvidenceId") REFERENCES "CandidateResumeEvidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CandidateCapabilityResumeLink_capabilityId_resumeEvidenceId_key" ON "CandidateCapabilityResumeLink"("capabilityId", "resumeEvidenceId");
CREATE INDEX "CandidateCapabilityResumeLink_resumeEvidenceId_idx" ON "CandidateCapabilityResumeLink"("resumeEvidenceId");

CREATE TABLE "CandidateResumeReadiness" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capabilityCoverage" INTEGER NOT NULL,
    "industryCoverage" INTEGER NOT NULL,
    "domainCoverage" INTEGER NOT NULL,
    "leadershipCoverage" INTEGER NOT NULL,
    "portfolioSupport" INTEGER NOT NULL,
    "capabilitiesWithoutResume" JSONB NOT NULL,
    "capabilitiesWithoutPortfolio" JSONB NOT NULL,
    "evidenceDistribution" JSONB NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "CandidateResumeReadiness_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CandidateResumeReadiness_profileId_key" ON "CandidateResumeReadiness"("profileId");
