import {
  copyFileSync,
  existsSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, resolve } from "node:path";

import {
  backupDirectory,
  createBackup,
  databasePath,
  requireStoppedApplication,
  timestamp,
  validateSqlite,
} from "./sqlite-tools.mjs";

const suppliedPath = process.argv[2];
if (!suppliedPath) {
  throw new Error(
    "Provide a backup path: npm run db:restore -- /absolute/path/to/backup.db",
  );
}

const backupPath = resolve(suppliedPath);
if (!existsSync(backupPath)) {
  throw new Error(`Backup does not exist: ${backupPath}`);
}
if (backupPath === databasePath) {
  throw new Error("The restore source cannot be the active database.");
}

requireStoppedApplication();
validateSqlite(backupPath);

const restoreTimestamp = timestamp();
const safetyBackup = resolve(
  backupDirectory,
  `pre-restore-${restoreTimestamp}.db`,
);
createBackup(safetyBackup);

const temporaryDatabase = `${databasePath}.restore-${process.pid}`;
const replacedDatabase = `${databasePath}.replaced-${restoreTimestamp}`;

try {
  copyFileSync(backupPath, temporaryDatabase);
  validateSqlite(temporaryDatabase);
  renameSync(databasePath, replacedDatabase);
  renameSync(temporaryDatabase, databasePath);
  validateSqlite(databasePath);
  rmSync(replacedDatabase, { force: true });
} catch (error) {
  rmSync(temporaryDatabase, { force: true });
  if (!existsSync(databasePath) && existsSync(replacedDatabase)) {
    renameSync(replacedDatabase, databasePath);
  }
  throw error;
}

process.stdout.write(
  `Restored ${basename(backupPath)} safely.\nPre-restore backup: ${safetyBackup}\n`,
);
