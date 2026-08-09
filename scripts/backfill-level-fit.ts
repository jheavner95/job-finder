/**
 * Assess every persisted job's career-level fit.
 *
 * Writes only to `JobLevelAssessment`. No scans, no employer resolution, no
 * provider requests, and no change to any evaluation, eligibility assessment,
 * connector, crawl or batch row.
 *
 *   npx tsx scripts/backfill-level-fit.ts
 */
import { PrismaClient } from "@prisma/client";

import { LEVEL_LABEL, targetBand } from "../lib/level-fit";
import { loadCandidateLevelProfile, reassessAllLevels } from "../lib/level-fit/service";

const prisma = new PrismaClient();

async function main() {
  const profile = await loadCandidateLevelProfile(prisma);
  const band = targetBand(profile);
  console.log("Candidate level profile");
  console.log(`  target band ..... ${band ? `${LEVEL_LABEL[band.min]} – ${LEVEL_LABEL[band.max]}` : "not derivable"}`);
  console.log(`  current level ... ${LEVEL_LABEL[profile.currentLevel]}`);
  console.log(`  years ........... ${profile.yearsExperience ?? "not recorded"}`);
  console.log(`  track ........... ${profile.trackPreference ?? "not declared"}\n`);

  const before = await prisma.jobLevelAssessment.count();
  const counts = await reassessAllLevels(prisma);
  const after = await prisma.jobLevelAssessment.count();

  console.log(`assessed .............. ${counts.total}`);
  for (const key of ["IDEAL", "COMPATIBLE", "STRETCH", "TOO_JUNIOR", "TOO_SENIOR", "TRACK_MISMATCH", "REVIEW_REQUIRED", "UNKNOWN"] as const) {
    console.log(`  ${key.toLowerCase().replace("_", " ").padEnd(20, ".")} ${counts[key]}`);
  }
  console.log(`\nassessment rows ${before} -> ${after}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
