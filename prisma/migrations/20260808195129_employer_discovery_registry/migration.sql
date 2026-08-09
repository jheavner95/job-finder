-- CreateTable
CREATE TABLE "EmployerCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "probesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "resolvedProvider" TEXT,
    "resolvedKey" TEXT,
    "connectorId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CompanyConnector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "careerUrl" TEXT NOT NULL,
    "atsType" TEXT NOT NULL,
    "connectorKey" TEXT NOT NULL,
    "searchCriteria" JSONB,
    "robotsPolicy" TEXT,
    "crawlDelay" INTEGER,
    "rateLimit" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "health" TEXT NOT NULL DEFAULT 'Disabled',
    "lastChecked" DATETIME,
    "lastSuccessfulFetch" DATETIME,
    "notes" TEXT,
    "credentialStatus" TEXT NOT NULL DEFAULT 'NotRequired',
    "credentialCheckedAt" DATETIME,
    "credentialRegion" TEXT,
    "feedStatus" TEXT NOT NULL DEFAULT 'NotRequired',
    "feedCheckedAt" DATETIME,
    "feedOrigin" TEXT,
    "feedPath" TEXT,
    "feedVersion" TEXT,
    "discoverySource" TEXT NOT NULL DEFAULT 'manual',
    "discoveryConfidence" INTEGER NOT NULL DEFAULT 100,
    "validationStatus" TEXT NOT NULL DEFAULT 'Unvalidated',
    "jobsAvailable" INTEGER NOT NULL DEFAULT 0,
    "relevantRoles" INTEGER NOT NULL DEFAULT 0,
    "lastValidatedAt" DATETIME,
    "boardFingerprint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CompanyConnector" ("atsType", "careerUrl", "company", "connectorKey", "crawlDelay", "createdAt", "credentialCheckedAt", "credentialRegion", "credentialStatus", "enabled", "feedCheckedAt", "feedOrigin", "feedPath", "feedStatus", "feedVersion", "health", "id", "lastChecked", "lastSuccessfulFetch", "notes", "rateLimit", "robotsPolicy", "searchCriteria", "updatedAt") SELECT "atsType", "careerUrl", "company", "connectorKey", "crawlDelay", "createdAt", "credentialCheckedAt", "credentialRegion", "credentialStatus", "enabled", "feedCheckedAt", "feedOrigin", "feedPath", "feedStatus", "feedVersion", "health", "id", "lastChecked", "lastSuccessfulFetch", "notes", "rateLimit", "robotsPolicy", "searchCriteria", "updatedAt" FROM "CompanyConnector";
DROP TABLE "CompanyConnector";
ALTER TABLE "new_CompanyConnector" RENAME TO "CompanyConnector";
CREATE UNIQUE INDEX "CompanyConnector_company_key" ON "CompanyConnector"("company");
CREATE INDEX "CompanyConnector_atsType_enabled_idx" ON "CompanyConnector"("atsType", "enabled");
CREATE INDEX "CompanyConnector_health_idx" ON "CompanyConnector"("health");
CREATE INDEX "CompanyConnector_discoverySource_idx" ON "CompanyConnector"("discoverySource");
CREATE INDEX "CompanyConnector_validationStatus_idx" ON "CompanyConnector"("validationStatus");
CREATE UNIQUE INDEX "CompanyConnector_atsType_connectorKey_key" ON "CompanyConnector"("atsType", "connectorKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EmployerCandidate_normalizedName_key" ON "EmployerCandidate"("normalizedName");

-- CreateIndex
CREATE INDEX "EmployerCandidate_status_lastAttemptAt_idx" ON "EmployerCandidate"("status", "lastAttemptAt");

-- CreateIndex
CREATE INDEX "EmployerCandidate_source_idx" ON "EmployerCandidate"("source");
