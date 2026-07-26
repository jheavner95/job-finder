import { completeCandidateEvidence } from "../lib/candidate-intelligence/evidence-completion";
import { prisma } from "../lib/db";

const result = await completeCandidateEvidence(prisma);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await prisma.$disconnect();
