/**
 * Runs a manual discovery scan across every enabled board.
 *
 *   npm run coverage:scan
 *
 * Same code path the "Scan All Providers" button uses — the scheduler, the
 * provider runners, and the disposition ledger. This exists so a full-coverage
 * scan can be run and observed outside the browser.
 */
import { prisma } from "../lib/db";
import { DiscoveryScheduler } from "../lib/scheduling/discovery-scheduler";

async function main() {
  const enabled = await prisma.companyConnector.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  console.log(`starting manual scan across ${enabled.length} enabled boards`);
  const started = Date.now();
  const result = await new DiscoveryScheduler(prisma).run({
    trigger: "manual",
    connectorIds: enabled.map((connector) => connector.id),
  });
  console.log("\nSCAN COMPLETE");
  console.log(`  batch ......................... ${result.batchId}`);
  console.log(`  status ........................ ${result.status}`);
  console.log(`  boards processed .............. ${result.companiesProcessed}`);
  console.log(`  postings retrieved ............ ${result.jobsDiscovered}`);
  console.log(`  imported ...................... ${result.jobsImported}`);
  console.log(`  duplicates .................... ${result.duplicates}`);
  console.log(`  failures ...................... ${result.failures}`);
  console.log(`  wall clock .................... ${Math.round((Date.now() - started) / 1000)}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
