import { spawn } from "node:child_process";

import { localUrl } from "./local-runtime.mjs";

if (process.platform !== "darwin") {
  throw new Error("local:open currently supports macOS only.");
}

const child = spawn("open", [localUrl], {
  detached: true,
  stdio: "ignore",
});
child.unref();
process.stdout.write(`Opening ${localUrl}\n`);
