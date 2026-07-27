import { expect, vi } from "vitest";

import type { JobSourceProvider } from "../lib/job-sources/provider";
import type { ProviderContext } from "../lib/job-sources/types";
import { getOperationalCapability } from "../lib/job-sources/capabilities";

export async function certifyProviderContract(input: {
  providerId: string;
  createProvider: (client: typeof fetch) => JobSourceProvider;
  context: ProviderContext;
  discoveryBody: string;
  detailBody?: string;
  sourceJobId: string;
  canonicalUrl: string;
}) {
  let requestCount = 0;
  const client: typeof fetch = vi.fn<typeof fetch>(async (_request, init) => {
    requestCount += 1;
    const accept = new Headers(init?.headers).get("Accept") ?? "";
    return new Response(
      requestCount > 1 && input.detailBody
        ? input.detailBody
        : input.discoveryBody,
      {
        status: 200,
        headers: {
          "Content-Type": accept.includes("json") ? "application/json" : "application/xml",
        },
      },
    );
  });
  const provider = input.createProvider(client);
  const capability = getOperationalCapability(input.providerId);
  const result = provider.discoverDetailed
    ? await provider.discoverDetailed({ titles: [], locations: [] }, input.context)
    : null;
  expect(result, `${input.providerId} must expose detailed discovery`).not.toBeNull();
  expect(result?.feed).toEqual({
    complete: capability.completeFeed,
    sourceJobIds: [input.sourceJobId],
  });
  expect(result?.diagnostics.totalJobsDiscovered).toBe(1);
  expect(result?.jobs[0]).toMatchObject({
    providerId: input.providerId,
    externalId: input.sourceJobId,
    canonicalUrl: input.canonicalUrl,
  });
  const posting = await provider.fetch(result!.jobs[0], input.context);
  const normalized = provider.normalize(posting, input.context);
  expect(provider.validate(normalized)).toEqual({ valid: true, errors: [] });
  expect(normalized.providerExternalId).toBe(input.sourceJobId);
  expect(normalized.url).toBe(input.canonicalUrl);
  expect(capability).toMatchObject({
    diagnosticSupport: "standard",
    schemaValidator: "adapter",
  });
}
