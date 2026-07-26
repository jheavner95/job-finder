import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const runtimeDirectory = resolve(projectRoot, ".local");
export const pidFile = resolve(
  runtimeDirectory,
  "job-search-intelligence.pid.json",
);
export const logFile = resolve(runtimeDirectory, "app.log");
export const localUrl =
  process.env.JSI_LOCAL_URL ?? "http://127.0.0.1:3000";
const localPort = new URL(localUrl).port || "3000";

export function ensureRuntimeDirectory() {
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
}

export function readPidState() {
  if (!existsSync(pidFile)) return null;
  try {
    const state = JSON.parse(readFileSync(pidFile, "utf8"));
    if (
      typeof state.pid !== "number" ||
      state.pid <= 0 ||
      state.projectRoot !== projectRoot
    ) {
      throw new Error("invalid state");
    }
    return state;
  } catch {
    throw new Error(
      `Invalid local runtime state at ${pidFile}. Remove it only after confirming the application is stopped.`,
    );
  }
}

export function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

export function clearStalePidFile() {
  rmSync(pidFile, { force: true });
}

function processWorkingDirectory(pid) {
  try {
    const output = execFileSync(
      "lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1);
  } catch {
    return null;
  }
}

export function findLocalServer() {
  try {
    const output = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${localPort}`, "-sTCP:LISTEN", "-Fp"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const pid = Number(
      output
        .split("\n")
        .find((line) => line.startsWith("p"))
        ?.slice(1),
    );
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return {
      pid,
      projectRoot: processWorkingDirectory(pid),
    };
  } catch {
    return null;
  }
}

export function isExpectedLocalServer(pid) {
  if (!isRunning(pid)) return false;
  const server = findLocalServer();
  return server?.pid === pid && server.projectRoot === projectRoot;
}
