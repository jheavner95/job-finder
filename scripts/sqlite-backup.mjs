import { resolve } from "node:path";

import {
  backupDirectory,
  createBackup,
  timestamp,
} from "./sqlite-tools.mjs";

const destination = resolve(
  backupDirectory,
  `job-search-intelligence-${timestamp()}.db`,
);
createBackup(destination);
process.stdout.write(`Created verified SQLite backup:\n${destination}\n`);
