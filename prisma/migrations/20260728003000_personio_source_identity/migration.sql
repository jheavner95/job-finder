CREATE UNIQUE INDEX "Job_sourceId_companyId_sourceJobId_key"
ON "Job"("sourceId", "companyId", "sourceJobId");
