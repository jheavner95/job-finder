import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  isRunning,
  projectRoot,
  readPidState,
} from "./local-runtime.mjs";

export const databasePath = resolve(projectRoot, "prisma", "dev.db");
export const backupDirectory = resolve(projectRoot, "backups", "sqlite");

export function timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
}

export function requireDatabase() {
  if (!existsSync(databasePath)) {
    throw new Error(
      `SQLite database not found at ${databasePath}. Run npm run db:migrate first.`,
    );
  }
}

export function requireStoppedApplication() {
  const state = readPidState();
  if (state && isRunning(state.pid)) {
    throw new Error(
      "Stop the local application with npm run local:stop before restoring a backup.",
    );
  }
}

export function validateSqlite(path) {
  const result = execFileSync("sqlite3", [path, "PRAGMA integrity_check;"], {
    encoding: "utf8",
  }).trim();
  if (result !== "ok") {
    throw new Error(`SQLite integrity check failed for ${path}: ${result}`);
  }
}

export function createBackup(destination) {
  requireDatabase();
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const escaped = destination.replaceAll("'", "''");
  execFileSync("sqlite3", [databasePath, `.backup '${escaped}'`], {
    stdio: "pipe",
  });
  validateSqlite(destination);
}
