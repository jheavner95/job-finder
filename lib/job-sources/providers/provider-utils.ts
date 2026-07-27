import type { ProviderContext } from "../types";
import { ProviderError } from "../errors";

export function connectorToken(context: ProviderContext) {
  const token = context.connectorKey.trim();
  if (!token) throw new Error(`Connector key is missing for ${context.company}.`);
  return token;
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function joinedText(...values: unknown[]) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => stringValue(value))
    .filter(Boolean)
    .join("\n");
}

export function configuredHealth(
  name: string,
  context: ProviderContext,
) {
  const enabled = context.enabled !== false;
  const blocked = context.robotsPolicy?.toLowerCase() === "disallow";
  const configured = Boolean(context.connectorKey.trim());
  return {
    status: !enabled
      ? "Disabled" as const
      : blocked || !configured
        ? "Warning" as const
        : "Healthy" as const,
    message: !enabled
      ? `${name} connector is disabled.`
      : blocked
        ? "Robots policy currently prevents fetches."
        : !configured
          ? `${name} connector key is missing.`
        : `${name} connector is configured and ready.`,
    checkedAt: new Date(),
    diagnostics: {
      connectorConfigured: configured,
      robotsPolicy: context.robotsPolicy ?? "unknown",
      crawlDelay: context.crawlDelay ?? null,
      rateLimit: context.rateLimit ?? null,
    },
  };
}

export function validateProviderRecords<T extends { id: string; title: string; url: string }>(
  providerId: string,
  records: T[],
) {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    if (!record.id) {
      throw new ProviderError(
        "MISSING_ID",
        "A provider posting is missing its required identifier.",
        { providerId, recordIndex: index },
      );
    }
    if (seen.has(record.id)) {
      throw new ProviderError(
        "DUPLICATE_ID",
        "The provider feed contains a duplicate posting identifier.",
        { providerId, sourceJobId: record.id },
      );
    }
    if (!record.title) {
      throw new ProviderError(
        "SCHEMA_DRIFT",
        "A provider posting is missing its required title.",
        { providerId, sourceJobId: record.id },
      );
    }
    try {
      const url = new URL(record.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      throw new ProviderError(
        "SCHEMA_DRIFT",
        "A provider posting has an invalid canonical URL.",
        { providerId, sourceJobId: record.id },
      );
    }
    seen.add(record.id);
  });
  return records;
}
