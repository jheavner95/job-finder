ALTER TABLE "CompanyConnector" ADD COLUMN "credentialStatus" TEXT NOT NULL DEFAULT 'NotRequired';
ALTER TABLE "CompanyConnector" ADD COLUMN "credentialCheckedAt" DATETIME;
ALTER TABLE "CompanyConnector" ADD COLUMN "credentialRegion" TEXT;
