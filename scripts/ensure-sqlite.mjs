import { closeSync, existsSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databasePath = resolve(projectRoot, "prisma", "dev.db");

if (!existsSync(databasePath)) {
  closeSync(openSync(databasePath, "wx"));
  process.stdout.write(`Created ${databasePath}\n`);
}
