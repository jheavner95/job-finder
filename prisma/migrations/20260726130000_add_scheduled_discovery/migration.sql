CREATE TABLE "ConnectorSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleType" TEXT NOT NULL DEFAULT 'Manual',
    "timeOfDay" TEXT,
    "weekday" INTEGER,
    "intervalMinutes" INTEGER,
    "nextRunAt" DATETIME,
    "lastRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "connectorId" TEXT NOT NULL,
    CONSTRAINT "ConnectorSchedule_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "CompanyConnector" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConnectorSchedule_connectorId_key" ON "ConnectorSchedule"("connectorId");
CREATE INDEX "ConnectorSchedule_scheduleType_nextRunAt_idx" ON "ConnectorSchedule"("scheduleType", "nextRunAt");

CREATE TABLE "DiscoveryBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    "connectorsRun" INTEGER NOT NULL DEFAULT 0,
    "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "jobsImported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB
);

CREATE INDEX "DiscoveryBatch_startedAt_idx" ON "DiscoveryBatch"("startedAt");
CREATE INDEX "DiscoveryBatch_status_idx" ON "DiscoveryBatch"("status");

CREATE TABLE "SchedulerLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lockToken" TEXT,
    "lockedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT,
    "metadata" JSONB,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

ALTER TABLE "ConnectorCrawl" ADD COLUMN "batchId" TEXT REFERENCES "DiscoveryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ConnectorCrawl_batchId_idx" ON "ConnectorCrawl"("batchId");
