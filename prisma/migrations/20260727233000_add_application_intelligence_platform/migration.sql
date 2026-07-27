PRAGMA foreign_keys=OFF;

ALTER TABLE "Application" RENAME TO "Application_legacy";

CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'Preparing',
    "currentStage" TEXT NOT NULL DEFAULT 'Preparing',
    "appliedAt" DATETIME,
    "applicationUrl" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "location" TEXT,
    "salary" TEXT,
    "recruiter" TEXT,
    "hiringManager" TEXT,
    "sourceProvider" TEXT,
    "outcome" TEXT,
    "rejectionReason" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "nextStepAt" DATETIME,
    "jobId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "Application" (
    "id", "status", "currentStage", "appliedAt", "company", "role", "location",
    "salary", "sourceProvider", "notes", "nextStepAt", "jobId", "createdAt", "updatedAt"
)
SELECT
    legacy."id",
    CASE legacy."status"
      WHEN 'APPLIED' THEN 'Applied'
      WHEN 'INTERVIEWING' THEN 'Recruiter Screen'
      WHEN 'OFFER' THEN 'Offer'
      WHEN 'CLOSED' THEN 'Closed'
      ELSE 'Applied'
    END,
    CASE legacy."status"
      WHEN 'APPLIED' THEN 'Applied'
      WHEN 'INTERVIEWING' THEN 'Recruiter Screen'
      WHEN 'OFFER' THEN 'Offer'
      WHEN 'CLOSED' THEN 'Closed'
      ELSE 'Applied'
    END,
    legacy."appliedAt",
    company."name",
    job."title",
    job."location",
    job."compensationText",
    source."name",
    legacy."notes",
    legacy."nextStepAt",
    legacy."jobId",
    legacy."createdAt",
    legacy."updatedAt"
FROM "Application_legacy" legacy
JOIN "Job" job ON job."id" = legacy."jobId"
JOIN "Company" company ON company."id" = job."companyId"
JOIN "JobSource" source ON source."id" = job."sourceId";

DROP TABLE "Application_legacy";

CREATE UNIQUE INDEX "Application_jobId_key" ON "Application"("jobId");
CREATE INDEX "Application_status_archived_idx" ON "Application"("status", "archived");
CREATE INDEX "Application_appliedAt_idx" ON "Application"("appliedAt");

CREATE TABLE "ApplicationStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT NOT NULL,
    CONSTRAINT "ApplicationStatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApplicationStatusHistory_applicationId_createdAt_idx" ON "ApplicationStatusHistory"("applicationId", "createdAt");

INSERT INTO "ApplicationStatusHistory" ("id", "status", "notes", "createdAt", "applicationId")
SELECT lower(hex(randomblob(12))), "status", 'Imported from the existing application record.', "createdAt", "id"
FROM "Application";

CREATE TABLE "ApplicationContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "linkedin" TEXT,
    "notes" TEXT,
    "applicationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApplicationContact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApplicationContact_applicationId_kind_idx" ON "ApplicationContact"("applicationId", "kind");

CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "referenceUrl" TEXT,
    "notes" TEXT,
    "submittedAt" DATETIME,
    "applicationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApplicationDocument_applicationId_kind_idx" ON "ApplicationDocument"("applicationId", "kind");

CREATE TABLE "ApplicationTimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "notes" TEXT,
    "eventAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT NOT NULL,
    "relatedContactId" TEXT,
    "relatedDocumentId" TEXT,
    CONSTRAINT "ApplicationTimelineEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationTimelineEvent_relatedContactId_fkey" FOREIGN KEY ("relatedContactId") REFERENCES "ApplicationContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApplicationTimelineEvent_relatedDocumentId_fkey" FOREIGN KEY ("relatedDocumentId") REFERENCES "ApplicationDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ApplicationTimelineEvent_applicationId_eventAt_idx" ON "ApplicationTimelineEvent"("applicationId", "eventAt");

CREATE TABLE "ApplicationCommunication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "attachment" TEXT,
    "applicationId" TEXT NOT NULL,
    "contactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationCommunication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApplicationCommunication_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ApplicationContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ApplicationCommunication_applicationId_occurredAt_idx" ON "ApplicationCommunication"("applicationId", "occurredAt");

CREATE TABLE "ApplicationInterview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "round" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "participants" TEXT,
    "scheduledAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER,
    "preparationNotes" TEXT,
    "feedback" TEXT,
    "outcome" TEXT,
    "applicationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApplicationInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApplicationInterview_applicationId_scheduledAt_idx" ON "ApplicationInterview"("applicationId", "scheduledAt");

CREATE TABLE "ApplicationFollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "applicationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApplicationFollowUp_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApplicationFollowUp_dueAt_completedAt_idx" ON "ApplicationFollowUp"("dueAt", "completedAt");
CREATE INDEX "ApplicationFollowUp_applicationId_idx" ON "ApplicationFollowUp"("applicationId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
