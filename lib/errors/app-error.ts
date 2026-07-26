export const APP_ERROR_CODES = [
  "VALIDATION_ERROR",
  "FILE_IMPORT_ERROR",
  "FILE_FORMAT_UNSUPPORTED",
  "PDF_PARSE_ERROR",
  "DOCX_PARSE_ERROR",
  "DATABASE_ERROR",
  "CONNECTOR_BLOCKED",
  "CONNECTOR_UNAVAILABLE",
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "ROBOTS_DISALLOWED",
  "DUPLICATE_RECORD",
  "SCHEDULER_BUSY",
  "PERMISSION_ERROR",
  "CONFIGURATION_ERROR",
  "UNKNOWN_ERROR",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type AppError = {
  code: AppErrorCode;
  title: string;
  message: string;
  nextAction: string;
  timestamp: string;
  diagnosticId: string;
  retryable: boolean;
  details?: Record<string, string>;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

const descriptions: Record<AppErrorCode, Omit<AppError, "code" | "timestamp" | "diagnosticId" | "details">> = {
  VALIDATION_ERROR: { title: "Review the highlighted information.", message: "Some required information is missing or invalid.", nextAction: "Correct the highlighted fields and try again.", retryable: true },
  FILE_IMPORT_ERROR: { title: "We couldn’t import this file.", message: "Job Finder could not safely process the selected document.", nextAction: "Choose the file again or try another supported format.", retryable: true },
  FILE_FORMAT_UNSUPPORTED: { title: "This file format isn’t supported.", message: "Job Finder supports PDF, DOCX, Markdown, and TXT resumes.", nextAction: "Export the resume in a supported format and try again.", retryable: true },
  PDF_PARSE_ERROR: { title: "We couldn’t read this PDF.", message: "The file was uploaded, but its text could not be extracted.", nextAction: "Try exporting the resume as DOCX or TXT, or choose another PDF.", retryable: true },
  DOCX_PARSE_ERROR: { title: "We couldn’t read this DOCX file.", message: "The document could not be opened as a valid Word file.", nextAction: "Open and re-save the document, or export it as PDF or TXT.", retryable: true },
  DATABASE_ERROR: { title: "Job Finder couldn’t save this change.", message: "The private local database is temporarily unavailable.", nextAction: "Try again. If the problem continues, verify the local database is available.", retryable: true },
  CONNECTOR_BLOCKED: { title: "This source is currently blocked.", message: "Job Finder stopped before accessing the source.", nextAction: "Review the source status and use another supported public source.", retryable: false },
  CONNECTOR_UNAVAILABLE: { title: "Job Finder couldn’t reach this source.", message: "The source is unavailable or does not provide a supported public endpoint.", nextAction: "Check the source configuration or try again later.", retryable: true },
  NETWORK_ERROR: { title: "Job Finder couldn’t reach this source.", message: "The network request did not complete.", nextAction: "Check your internet connection or try again later.", retryable: true },
  RATE_LIMITED: { title: "This source asked Job Finder to slow down.", message: "The provider’s request limit was reached.", nextAction: "Wait for the configured delay, then try again.", retryable: true },
  ROBOTS_DISALLOWED: { title: "This source does not permit automated access.", message: "Job Finder skipped it to remain compliant.", nextAction: "Use another supported public source or import a job manually.", retryable: false },
  DUPLICATE_RECORD: { title: "This record already exists.", message: "Job Finder found an existing version and did not create a duplicate.", nextAction: "Open the existing record to continue.", retryable: false },
  SCHEDULER_BUSY: { title: "A discovery run is already in progress.", message: "Job Finder prevents concurrent runs to protect your local data.", nextAction: "Wait for the current run to finish, then try again.", retryable: true },
  PERMISSION_ERROR: { title: "Job Finder doesn’t have permission for that action.", message: "The requested local file or resource could not be accessed.", nextAction: "Check the file permission and try again.", retryable: true },
  CONFIGURATION_ERROR: { title: "This feature needs configuration.", message: "A required local setting is missing or invalid.", nextAction: "Review the local configuration and try again.", retryable: false },
  UNKNOWN_ERROR: { title: "Something unexpected happened.", message: "Job Finder couldn’t complete this action safely.", nextAction: "Try again. If it continues, copy the diagnostic details.", retryable: true },
};

function diagnosticId() {
  return globalThis.crypto?.randomUUID?.() ?? `diag-${Date.now().toString(36)}`;
}

export function createAppError(
  code: AppErrorCode,
  details?: Record<string, string | undefined>,
): AppError {
  return {
    code,
    ...descriptions[code],
    timestamp: new Date().toISOString(),
    diagnosticId: diagnosticId(),
    details: details
      ? Object.fromEntries(Object.entries(details).filter((entry): entry is [string, string] => Boolean(entry[1])))
      : undefined,
  };
}

export function mapError(error: unknown, details?: Record<string, string | undefined>): AppError {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (/p2002|unique constraint|already exists/.test(message)) return createAppError("DUPLICATE_RECORD", details);
  if (/pdf/.test(message)) return createAppError("PDF_PARSE_ERROR", details);
  if (/docx|zip|word document/.test(message)) return createAppError("DOCX_PARSE_ERROR", details);
  if (/robots|disallow/.test(message)) return createAppError("ROBOTS_DISALLOWED", details);
  if (/429|rate limit/.test(message)) return createAppError("RATE_LIMITED", details);
  if (/scheduler|lock|already running|concurrent/.test(message)) return createAppError("SCHEDULER_BUSY", details);
  if (/fetch failed|network|econn|enotfound|timeout/.test(message)) return createAppError("NETWORK_ERROR", details);
  if (/prisma|sqlite|database/.test(message)) return createAppError("DATABASE_ERROR", details);
  if (/permission|eacces|eperm/.test(message)) return createAppError("PERMISSION_ERROR", details);
  return createAppError("UNKNOWN_ERROR", details);
}

export function diagnosticText(error: AppError) {
  return [
    `Code: ${error.code}`,
    `Diagnostic ID: ${error.diagnosticId}`,
    `Timestamp: ${error.timestamp}`,
    ...Object.entries(error.details ?? {}).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}
