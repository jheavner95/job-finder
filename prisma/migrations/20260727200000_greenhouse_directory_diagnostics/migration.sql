CREATE UNIQUE INDEX "CompanyConnector_atsType_connectorKey_key"
ON "CompanyConnector"("atsType", "connectorKey");

CREATE TABLE "GreenhouseComparisonItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "submittedUrl" TEXT NOT NULL,
  "canonicalUrl" TEXT,
  "boardToken" TEXT,
  "companyName" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "connectorId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "GreenhouseComparisonItem_createdAt_idx"
ON "GreenhouseComparisonItem"("createdAt");

CREATE INDEX "GreenhouseComparisonItem_boardToken_idx"
ON "GreenhouseComparisonItem"("boardToken");
