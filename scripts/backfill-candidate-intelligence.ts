import { ensureOpportunityIntelligence } from "../lib/candidate-intelligence/service";
import { prisma } from "../lib/db";

const result = await ensureOpportunityIntelligence(prisma, { force: true });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await prisma.$disconnect();
