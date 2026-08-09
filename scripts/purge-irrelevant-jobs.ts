/**
 * Removes stored jobs that the current relevance screen would reject.
 *
 *   npm run coverage:purge -- --dry-run
 *   npm run coverage:purge
 *
 * Needed because a provider can import postings under an older screen. Jobs the
 * user has acted on are never touched: anything with an application, a decision,
 * or a non-NEW status is preserved and reported instead.
 */
import { prisma } from "../lib/db";
import { evaluateRoleRelevance } from "../lib/job-sources/role-relevance";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const jobs = await prisma.job.findMany({
    where: { isSynthetic: false },
    select: {
      id: true,
      title: true,
      status: true,
      company: { select: { name: true } },
      application: { select: { id: true } },
      decisions: { select: { id: true }, take: 1 },
    },
  });

  const rejected = jobs.filter((job) => !evaluateRoleRelevance(job.title).relevant);
  const protectedJobs = rejected.filter((job) =>
    job.application || job.decisions.length || job.status !== "NEW");
  const removable = rejected.filter((job) => !protectedJobs.includes(job));

  console.log(`stored jobs .................... ${jobs.length}`);
  console.log(`fail the current screen ........ ${rejected.length}`);
  console.log(`protected (user has acted) ..... ${protectedJobs.length}`);
  console.log(`removable ...................... ${removable.length}`);
  for (const job of removable.slice(0, 15)) {
    console.log(`  - ${job.company.name} — ${job.title}`);
  }
  if (removable.length > 15) console.log(`  … and ${removable.length - 15} more`);

  if (dryRun) {
    console.log("\ndry run — nothing deleted");
    return;
  }
  const ids = removable.map((job) => job.id);
  for (let index = 0; index < ids.length; index += 200) {
    await prisma.job.deleteMany({ where: { id: { in: ids.slice(index, index + 200) } } });
  }
  console.log(`\ndeleted ${ids.length} job${ids.length === 1 ? "" : "s"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
