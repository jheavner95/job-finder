import {
  clearStalePidFile,
  isExpectedLocalServer,
  readPidState,
} from "./local-runtime.mjs";

const state = readPidState();
if (!state) {
  process.stdout.write("Job Finder is not running.\n");
  process.exit(0);
}
if (!isExpectedLocalServer(state.pid)) {
  clearStalePidFile();
  process.stdout.write("Removed stale runtime state; the application was not running.\n");
  process.exit(0);
}

process.kill(state.pid, "SIGTERM");
clearStalePidFile();
process.stdout.write("Stopped Job Finder.\n");
