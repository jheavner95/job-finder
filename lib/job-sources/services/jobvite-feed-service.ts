import type { PrismaClient } from "@prisma/client";

import {
  employerFeedStore,
  validateEmployerFeedConfiguration,
  type EmployerFeedConfiguration,
  type EmployerFeedStore,
} from "../employer-feed-config";
import { ProviderError } from "../errors";
import type { FetchClient } from "../provider";
import { JobviteProvider } from "../providers/jobvite";
import { checkRobots } from "../robots";

const PROVIDER_ID = "jobvite";

function safeLocation(configuration: EmployerFeedConfiguration) {
  const url = new URL(configuration.url);
  return { origin: url.origin, path: url.pathname };
}

export async function configureJobviteFeed(
  database: PrismaClient,
  input: {
    connectorId: string;
    feedUrl: string;
    employerId: string;
    schemaVersion?: "jobvite-v2";
  },
  options: {
    store?: EmployerFeedStore;
    client?: FetchClient;
  } = {},
) {
  const store = options.store ?? employerFeedStore;
  const client = options.client ?? fetch;
  const connector = await database.companyConnector.findUniqueOrThrow({
    where: { id: input.connectorId },
  });
  if (connector.atsType !== PROVIDER_ID) {
    throw new ProviderError(
      "INVALID_CONFIGURATION",
      "The selected connector is not a Jobvite employer feed.",
      { connectorId: connector.id },
    );
  }
  const configuration = validateEmployerFeedConfiguration({
    url: input.feedUrl,
    employerId: input.employerId,
    schemaVersion: input.schemaVersion ?? "jobvite-v2",
  });
  const location = safeLocation(configuration);
  const context = {
    connectorId: connector.id,
    company: connector.company,
    careerUrl: connector.careerUrl,
    connectorKey: connector.connectorKey,
    enabled: true,
    robotsPolicy: null,
    feedOrigin: location.origin,
    feedPath: location.path,
    feedVersion: configuration.schemaVersion,
  };

  const provider = new JobviteProvider(client, store);
  const validation = await provider.validateFeed(configuration, context);
  const robots = await checkRobots(
    `${location.origin}/robots.txt`,
    location.path,
    client,
  );
  if (!robots.allowed) {
    throw new ProviderError(
      "ROBOTS_DENIED",
      "The employer feed robots policy does not permit this request.",
      { providerId: PROVIDER_ID, path: location.path },
    );
  }

  await store.set(PROVIDER_ID, connector.id, configuration);
  await database.companyConnector.update({
    where: { id: connector.id },
    data: {
      enabled: true,
      health: "Healthy",
      robotsPolicy: robots.policy,
      crawlDelay: robots.crawlDelay,
      feedStatus: "Valid",
      feedCheckedAt: new Date(),
      feedOrigin: location.origin,
      feedPath: location.path,
      feedVersion: configuration.schemaVersion,
      notes: `Reviewed Jobvite employer feed (${validation.records} records).`,
    },
  });
  return validation;
}

export async function removeJobviteFeed(
  database: PrismaClient,
  connectorId: string,
  store: EmployerFeedStore = employerFeedStore,
) {
  const connector = await database.companyConnector.findUniqueOrThrow({
    where: { id: connectorId },
  });
  if (connector.atsType !== PROVIDER_ID) {
    throw new ProviderError("INVALID_CONFIGURATION", "The selected connector is not Jobvite.");
  }
  await store.remove(PROVIDER_ID, connector.id);
  await database.companyConnector.update({
    where: { id: connector.id },
    data: {
      enabled: false,
      health: "Disabled",
      robotsPolicy: null,
      feedStatus: "Missing",
      feedCheckedAt: new Date(),
      feedOrigin: null,
      feedPath: null,
      feedVersion: null,
    },
  });
}
