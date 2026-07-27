ALTER TABLE "Application" ADD COLUMN "industry" TEXT;

CREATE TABLE "CareerPerformanceSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "minSampleSize" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "CareerPerformanceSettings" ("id", "minSampleSize", "updatedAt")
VALUES ('primary', 5, CURRENT_TIMESTAMP);
