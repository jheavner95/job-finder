import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

import type { AppError } from "./app-error";

const MAX_BYTES = 256_000;
const LOG_DIRECTORY = join(process.cwd(), ".local", "logs");
const LOG_FILE = join(LOG_DIRECTORY, "errors.jsonl");

export async function logAppError(
  publicError: AppError,
  original: unknown,
  context: { operation: string; provider?: string; route?: string },
) {
  try {
    await mkdir(LOG_DIRECTORY, { recursive: true });
    const size = await stat(LOG_FILE).then((value) => value.size).catch(() => 0);
    if (size >= MAX_BYTES) {
      await rename(LOG_FILE, join(LOG_DIRECTORY, "errors.previous.jsonl")).catch(() => undefined);
    }
    const originalError = original instanceof Error ? original : new Error(String(original));
    await appendFile(LOG_FILE, `${JSON.stringify({
      timestamp: publicError.timestamp,
      code: publicError.code,
      diagnosticId: publicError.diagnosticId,
      operation: context.operation,
      provider: context.provider,
      route: context.route,
      errorName: originalError.name,
      errorMessage: originalError.message,
      stack: originalError.stack,
    })}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Logging must never replace the safe user-facing error.
  }
}
