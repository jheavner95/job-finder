export const PROVIDER_ERROR_CODES = [
  "TIMEOUT",
  "NETWORK",
  "RATE_LIMITED",
  "RETRY_AFTER",
  "MALFORMED_FEED",
  "SCHEMA_DRIFT",
  "MISSING_ID",
  "DUPLICATE_ID",
  "ROBOTS_DENIED",
  "AUTH_REQUIRED",
  "AUTH_EXPIRED",
  "INVALID_CONFIGURATION",
  "DELETED",
  "UNEXPECTED_RESPONSE",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export class ProviderError extends Error {
  readonly name = "ProviderError";

  constructor(
    readonly code: ProviderErrorCode,
    readonly providerMessage: string,
    readonly diagnosticContext: Record<string, string | number | boolean | null> = {},
    options?: ErrorOptions,
  ) {
    super(providerMessage, options);
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

export function providerError(
  error: unknown,
  fallbackMessage = "The provider returned an unexpected response.",
  context: Record<string, string | number | boolean | null> = {},
) {
  if (isProviderError(error)) return error;
  if (error instanceof Error) {
    const message = error.message;
    const classified: Array<[RegExp, ProviderErrorCode]> = [
      [/\bduplicate\b.*\bid\b/i, "DUPLICATE_ID"],
      [/\bmissing\b.*\bid\b|\bid\b.*\brequired\b/i, "MISSING_ID"],
      [/\bmalformed\b|not valid (?:json|xml)/i, "MALFORMED_FEED"],
      [/\bfeed invalid\b|\bschema\b/i, "SCHEMA_DRIFT"],
      [/\bno longer public\b|\bnot found\b/i, "DELETED"],
      [/\bconnector key\b|\bsource key\b|\baccount code\b/i, "INVALID_CONFIGURATION"],
    ];
    const match = classified.find(([pattern]) => pattern.test(message));
    if (match) {
      return new ProviderError(match[1], message, context, { cause: error });
    }
  }
  if (error instanceof Error && (
    error.name === "TimeoutError"
    || error.name === "AbortError"
  )) {
    return new ProviderError("TIMEOUT", "The provider request timed out.", context, {
      cause: error,
    });
  }
  if (error instanceof TypeError) {
    return new ProviderError("NETWORK", "The provider request could not be completed.", context, {
      cause: error,
    });
  }
  return new ProviderError("UNEXPECTED_RESPONSE", fallbackMessage, context, {
    cause: error,
  });
}

export function errorPersistence(error: unknown) {
  const typed = providerError(error);
  return {
    errorCode: typed.code,
    providerMessage: typed.providerMessage,
    diagnosticContext: typed.diagnosticContext,
  };
}
