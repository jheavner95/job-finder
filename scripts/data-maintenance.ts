import { PrismaClient } from "@prisma/client";

import { auditLocalData, cleanupLocalData } from "../lib/data-cleanup";

const database = new PrismaClient();
const command = process.argv[2] ?? "audit";
const apply = process.argv.includes("--apply");

try {
  const result = command === "cleanup"
    ? await cleanupLocalData(database, apply)
    : await auditLocalData(database);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await database.$disconnect();
}
