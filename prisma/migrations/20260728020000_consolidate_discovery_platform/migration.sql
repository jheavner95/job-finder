ALTER TABLE "ConnectorCrawl" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "ConnectorCrawl" ADD COLUMN "providerMessage" TEXT;
ALTER TABLE "ConnectorCrawl" ADD COLUMN "diagnosticContext" JSONB;
ALTER TABLE "Job" ADD COLUMN "reconciliationReason" TEXT;

CREATE INDEX "ConnectorCrawl_errorCode_idx" ON "ConnectorCrawl"("errorCode");
