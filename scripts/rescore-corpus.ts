/**
 * Re-score every job with the current scoring model.
 *
 * Replays each job's persisted category evidence through `scoreJob`, so the
 * postings are never re-parsed and nothing but the equation can move a score.
 * Writes a new JobEvaluation per job, preserving the previous one as history.
 *
 * Touches evaluations only: eligibility and level fit are independent
 * dimensions and are deliberately left alone.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";

import { scoreJob } from "../lib/scoring";
import { tierForScore } from "../lib/opportunity-tiers";
import type { CategoryInput, CategoryResult } from "../lib/types";

const SCORING_VERSION = "deterministic-v2";
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: { isSynthetic: false },
    select: {
      id: true, title: true, company: { select: { name: true } },
      evaluations: { orderBy: { evaluatedAt: "desc" }, take: 1,
        select: { score: true, reasoning: true, categoryResults: true, scoringVersion: true } },
    },
  });

  const moves = [];
  for (const job of jobs) {
    const previous = job.evaluations[0];
    if (!previous) continue;
    if (previous.scoringVersion === SCORING_VERSION) {
      console.error(`REFUSING: ${job.title} already carries ${SCORING_VERSION}.`);
      process.exit(2);
    }
    const stored = previous.categoryResults as unknown as CategoryResult[];
    // Replay the same inputs the original evaluation used.
    const inputs: CategoryInput[] = stored.map((item) => ({
      category: item.category,
      rating: item.rating,
      reason: item.reason,
      evidence: item.evidence,
      evidenceState: item.evidenceState,
    }));
    const evaluation = scoreJob(inputs);
    const tier = tierForScore(evaluation.score);
    const before = { score: previous.score, tier: (previous.reasoning as { tier?: string })?.tier ?? null };

    await prisma.jobEvaluation.create({
      data: {
        jobId: job.id,
        score: evaluation.score,
        reasoning: {
          summary: evaluation.summary,
          confidence: evaluation.confidence,
          eligibility: evaluation.eligibility,
          tier,
          importMethod: "rescore-missing-evidence-correction",
        },
        categoryResults: evaluation.categories,
        scoringVersion: SCORING_VERSION,
      },
    });
    moves.push({ id: job.id, employer: job.company.name, title: job.title,
      before: before.score, after: evaluation.score, tierBefore: before.tier, tierAfter: tier,
      confidence: evaluation.confidence });
  }

  fs.writeFileSync(`${process.env.S}/de3j-moves.json`, JSON.stringify(moves, null, 1));
  console.log(`re-scored ${moves.length} jobs`);
  console.log(`  score changed ... ${moves.filter((m) => m.before !== m.after).length}`);
  console.log(`  tier changed .... ${moves.filter((m) => m.tierBefore !== m.tierAfter).length}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
