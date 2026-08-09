/**
 * Employer discovery runner.
 *
 *   npm run coverage:discover -- --harvest              collect employer names only
 *   npm run coverage:discover -- --resolve --limit 200  resolve pending names to boards
 *   npm run coverage:discover -- --revalidate           re-check registered boards
 *   npm run coverage:discover                           harvest, then resolve
 */
import { prisma } from "../lib/db";
import {
  harvestCandidates,
  resolveCandidates,
  revalidateBoards,
} from "../lib/job-sources/services/employer-discovery";

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function value(name: string, fallback: number) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const harvest = flag("harvest");
  const resolve = flag("resolve");
  const revalidate = flag("revalidate");
  const runAll = !harvest && !resolve && !revalidate;

  if (harvest || runAll) {
    console.log("\nHARVESTING EMPLOYER NAMES");
    const summary = await harvestCandidates(prisma);
    for (const source of summary.sources) {
      const status = source.skipped ? `skipped — ${source.reason}` : `${source.collected} names`;
      console.log(`  ${source.label.padEnd(34)} ${status}`);
    }
    console.log(`  unique employers seen ......... ${summary.namesSeen}`);
    console.log(`  new candidates queued ......... ${summary.candidatesCreated}`);
    console.log(`  already known ................. ${summary.alreadyKnown}`);
  }

  if (resolve || runAll) {
    const limit = value("limit", 250);
    console.log(`\nRESOLVING CANDIDATES TO PUBLIC ATS BOARDS (limit ${limit})`);
    const summary = await resolveCandidates(prisma, {
      limit,
      minimumConfidence: value("min-confidence", 60),
    });
    console.log(`  attempted ..................... ${summary.attempted}`);
    console.log(`  resolved to a board ........... ${summary.resolved}`);
    console.log(`  unresolved .................... ${summary.unresolved}`);
    console.log(`  already registered ............ ${summary.collisions}`);
    console.log(`  boards registered ............. ${summary.boardsRegistered}`);
    console.log(`  jobs now reachable ............ ${summary.jobsReachable}`);
    console.log(`  probe requests used ........... ${summary.probesUsed}`);
    const byProvider = Object.entries(summary.byProvider).sort((a, b) => b[1] - a[1]);
    if (byProvider.length) {
      console.log("  by provider:");
      for (const [provider, count] of byProvider) {
        console.log(`    ${provider.padEnd(18)} ${count}`);
      }
    }
  }

  if (revalidate) {
    console.log("\nREVALIDATING REGISTERED BOARDS");
    const summary = await revalidateBoards(prisma, { limit: value("limit", 500) });
    console.log(`  checked ....................... ${summary.checked}`);
    console.log(`  healthy ....................... ${summary.healthy}`);
    console.log(`  stale (identity changed) ...... ${summary.stale}`);
    console.log(`  failed (no jobs returned) ..... ${summary.failed}`);
  }

  const [employers, enabled, validated] = await Promise.all([
    prisma.companyConnector.count(),
    prisma.companyConnector.count({ where: { enabled: true } }),
    prisma.companyConnector.count({ where: { validationStatus: "Validated" } }),
  ]);
  const reachable = await prisma.companyConnector.aggregate({ _sum: { jobsAvailable: true } });
  console.log("\nREGISTRY STATE");
  console.log(`  employers known ............... ${employers}`);
  console.log(`  boards enabled ................ ${enabled}`);
  console.log(`  boards validated .............. ${validated}`);
  console.log(`  jobs reachable ................ ${reachable._sum.jobsAvailable ?? 0}`);
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
