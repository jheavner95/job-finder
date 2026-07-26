CREATE TABLE "CompanyConnector" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CompanyConnector_company_key" ON "CompanyConnector"("company");
CREATE INDEX "CompanyConnector_atsType_enabled_idx" ON "CompanyConnector"("atsType", "enabled");
CREATE INDEX "CompanyConnector_health_idx" ON "CompanyConnector"("health");

CREATE TABLE "ConnectorCrawl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "jobsImported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "lastError" TEXT,
    "metadata" JSONB,
    "connectorId" TEXT NOT NULL,
    CONSTRAINT "ConnectorCrawl_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "CompanyConnector" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ConnectorCrawl_connectorId_startedAt_idx" ON "ConnectorCrawl"("connectorId", "startedAt");
CREATE INDEX "ConnectorCrawl_status_idx" ON "ConnectorCrawl"("status");
