ALTER TABLE "CompanyConnector" ADD COLUMN "feedStatus" TEXT NOT NULL DEFAULT 'NotRequired';
ALTER TABLE "CompanyConnector" ADD COLUMN "feedCheckedAt" DATETIME;
ALTER TABLE "CompanyConnector" ADD COLUMN "feedOrigin" TEXT;
ALTER TABLE "CompanyConnector" ADD COLUMN "feedPath" TEXT;
ALTER TABLE "CompanyConnector" ADD COLUMN "feedVersion" TEXT;
