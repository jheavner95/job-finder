import type { FetchClient } from "./provider";
import { ProviderError, providerError } from "./errors";
import { getOperationalCapability } from "./capabilities";
import type { ProviderContext } from "./types";

export type RequestRuntime = {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

type RequestOptions = {
  providerId: string;
  client: FetchClient;
  url: string;
  context: ProviderContext;
  init?: RequestInit;
  responseType: "json" | "text";
  runtime?: RequestRuntime;
};

const MAX_RETRY_DELAY_MS = 60_000;

export function retryAfterMilliseconds(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(seconds * 1_000));
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, date - now));
}

export async function executeProviderRequest(options: RequestOptions) {
  if (options.context.enabled === false) {
    throw new ProviderError(
      "INVALID_CONFIGURATION",
      "The provider connector is disabled.",
      { providerId: options.providerId },
    );
  }
  if (options.context.robotsPolicy?.toLowerCase() === "disallow") {
    throw new ProviderError(
      "ROBOTS_DENIED",
      "The provider robots policy does not permit this request.",
      { providerId: options.providerId },
    );
  }
  const capability = getOperationalCapability(options.providerId);
  const runtime = {
    sleep: options.runtime?.sleep ?? ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds))),
    random: options.runtime?.random ?? Math.random,
    now: options.runtime?.now ?? Date.now,
  };
  const attempts = capability.retryPolicy.maximumAttempts;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await options.client(options.url, {
        ...options.init,
        headers: {
          Accept: options.responseType === "json" ? "application/json" : "text/plain, application/xml, text/xml",
          "User-Agent": "job-search-intelligence/1.0",
          ...options.init?.headers,
        },
        signal: options.init?.signal ?? AbortSignal.timeout(capability.requestTimeoutMs),
      });
    } catch (error) {
      const typed = providerError(error, "The provider request could not be completed.", {
        providerId: options.providerId,
        attempt: attempt + 1,
      });
      if (attempt + 1 >= attempts || !capability.retryPolicy.retryNetworkErrors) throw typed;
      await runtime.sleep(backoff(attempt, runtime.random()));
      continue;
    }

    if (!response.ok) {
      const typed = responseError(response, options.providerId, attempt + 1);
      const retryable = capability.retryPolicy.retryStatuses.includes(response.status);
      if (attempt + 1 >= attempts || !retryable) throw typed;
      const directed = capability.supportsRetryAfter
        ? retryAfterMilliseconds(response.headers.get("Retry-After"), runtime.now())
        : null;
      await runtime.sleep(directed ?? backoff(attempt, runtime.random()));
      continue;
    }

    const body = await response.text();
    if (options.responseType === "text") return body;
    try {
      return JSON.parse(body) as unknown;
    } catch (error) {
      throw new ProviderError(
        "MALFORMED_FEED",
        "The provider response was not valid JSON.",
        { providerId: options.providerId },
        { cause: error },
      );
    }
  }
  throw new ProviderError("UNEXPECTED_RESPONSE", "The provider request failed.");
}

function backoff(attempt: number, random: number) {
  const base = Math.min(MAX_RETRY_DELAY_MS, 250 * (2 ** attempt));
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(base + base * 0.25 * random));
}

function responseError(response: Response, providerId: string, attempt: number) {
  const context = { providerId, status: response.status, attempt };
  if (response.status === 401) {
    return new ProviderError("AUTH_REQUIRED", "Provider authentication is required.", context);
  }
  if (response.status === 403) {
    return new ProviderError("AUTH_EXPIRED", "Provider authorization was rejected or expired.", context);
  }
  if (response.status === 404) {
    return new ProviderError("DELETED", "The provider posting is no longer available.", context);
  }
  if (response.status === 429) {
    return new ProviderError(
      response.headers.has("Retry-After") ? "RETRY_AFTER" : "RATE_LIMITED",
      "The provider requested a slower request rate.",
      context,
    );
  }
  return new ProviderError(
    "UNEXPECTED_RESPONSE",
    `The provider returned HTTP ${response.status}.`,
    context,
  );
}
