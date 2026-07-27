ALTER TABLE "Application" ADD COLUMN "outcomeDate" DATETIME;
ALTER TABLE "Application" ADD COLUMN "futureEligibility" TEXT;
ALTER TABLE "Application" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Application" ADD COLUMN "compensationNotes" TEXT;

ALTER TABLE "ApplicationInterview" ADD COLUMN "timezone" TEXT;
ALTER TABLE "ApplicationInterview" ADD COLUMN "format" TEXT;
ALTER TABLE "ApplicationInterview" ADD COLUMN "locationUrl" TEXT;
ALTER TABLE "ApplicationInterview" ADD COLUMN "questionsToAsk" TEXT;
ALTER TABLE "ApplicationInterview" ADD COLUMN "postInterviewNotes" TEXT;
ALTER TABLE "ApplicationInterview" ADD COLUMN "followUpRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ApplicationInterview" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "ApplicationInterview" ADD COLUMN "cancelledAt" DATETIME;

ALTER TABLE "ApplicationFollowUp" ADD COLUMN "notes" TEXT;
ALTER TABLE "ApplicationFollowUp" ADD COLUMN "snoozedFrom" DATETIME;
ALTER TABLE "ApplicationFollowUp" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "ApplicationFollowUp" ADD COLUMN "contactId" TEXT REFERENCES "ApplicationContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ApplicationFollowUp_contactId_idx" ON "ApplicationFollowUp"("contactId");

CREATE TABLE "ApplicationAttentionDismissal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attentionType" TEXT NOT NULL,
    "dismissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationId" TEXT NOT NULL,
    CONSTRAINT "ApplicationAttentionDismissal_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ApplicationAttentionDismissal_applicationId_attentionType_key" ON "ApplicationAttentionDismissal"("applicationId", "attentionType");
CREATE INDEX "ApplicationAttentionDismissal_applicationId_idx" ON "ApplicationAttentionDismissal"("applicationId");
