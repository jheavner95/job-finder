import { prisma } from "../lib/db";
import { DiscoveryScheduler } from "../lib/scheduling/discovery-scheduler";

const result = await new DiscoveryScheduler(prisma).run({
  trigger: "scheduled",
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
await prisma.$disconnect();
