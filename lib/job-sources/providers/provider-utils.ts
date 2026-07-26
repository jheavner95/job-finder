import type { ProviderContext } from "../types";

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
