import { closeSync, openSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

import {
  clearStalePidFile,
  ensureRuntimeDirectory,
  findLocalServer,
  isRunning,
  localUrl,
  logFile,
  pidFile,
  projectRoot,
  readPidState,
} from "./local-runtime.mjs";
import { resolve } from "node:path";

ensureRuntimeDirectory();
const existing = readPidState();
if (existing && isRunning(existing.pid) && findLocalServer()?.pid === existing.pid) {
  process.stdout.write(`Already running at ${localUrl} (PID ${existing.pid}).\n`);
  process.exit(0);
}
if (existing) clearStalePidFile();

const occupied = findLocalServer();
if (occupied) {
  if (occupied.projectRoot !== projectRoot) {
    throw new Error(
      `Port ${new URL(localUrl).port} is already used by another application.`,
    );
  }
  writeFileSync(
    pidFile,
    `${JSON.stringify({
      pid: occupied.pid,
      projectRoot,
      startedAt: new Date().toISOString(),
      url: localUrl,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`Already running at ${localUrl} (PID ${occupied.pid}).\n`);
  process.exit(0);
}

const logDescriptor = openSync(logFile, "a", 0o600);
const child = spawn(
  resolve(projectRoot, "node_modules", ".bin", "next"),
  ["dev", "--hostname", "127.0.0.1"],
  {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", logDescriptor, logDescriptor],
  },
);
child.unref();
closeSync(logDescriptor);

let server = null;
for (let attempt = 0; attempt < 20 && !server; attempt += 1) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  server = findLocalServer();
}
if (!server || server.projectRoot !== projectRoot) {
  throw new Error(
    `The local server exited during startup. Review ${logFile} for details.`,
  );
}

writeFileSync(
  pidFile,
  `${JSON.stringify({
    pid: server.pid,
    projectRoot,
    startedAt: new Date().toISOString(),
    url: localUrl,
  }, null, 2)}\n`,
  { mode: 0o600 },
);
process.stdout.write(
  `Started Job Finder at ${localUrl} (PID ${server.pid}).\nLogs: ${logFile}\n`,
);
