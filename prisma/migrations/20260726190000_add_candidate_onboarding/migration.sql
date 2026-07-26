CREATE TABLE "CandidateOnboarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "highestStep" INTEGER NOT NULL DEFAULT 1,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "baselineReadiness" INTEGER NOT NULL DEFAULT 0,
    "completionReadiness" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "CandidateOnboarding_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CandidateOnboarding_profileId_key" ON "CandidateOnboarding"("profileId");

CREATE TABLE "CandidateResumeImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "parsedEvidence" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Preview',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "CandidateResumeImport_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CandidateResumeImport_profileId_createdAt_idx" ON "CandidateResumeImport"("profileId", "createdAt");

CREATE TABLE "CandidateCareerPreferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preferredRoles" JSONB NOT NULL,
    "preferredIndustries" JSONB NOT NULL,
    "workMode" TEXT,
    "compensation" TEXT,
    "companyExclusions" JSONB NOT NULL,
    "employmentTypes" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "CandidateCareerPreferences_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CandidateCareerPreferences_profileId_key" ON "CandidateCareerPreferences"("profileId");

CREATE TABLE "CandidateProjectProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'Needs evidence',
    "notes" TEXT,
    "screenshotName" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "profileId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    CONSTRAINT "CandidateProjectProgress_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CandidateProjectProgress_profileId_projectId_key" ON "CandidateProjectProgress"("profileId", "projectId");
CREATE INDEX "CandidateProjectProgress_profileId_status_idx" ON "CandidateProjectProgress"("profileId", "status");
