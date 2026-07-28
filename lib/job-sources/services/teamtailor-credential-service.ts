import type { PrismaClient } from "@prisma/client";

import {
  MemoryCredentialStore,
  providerCredentialStore,
  type ProviderCredentialStore,
  type TeamtailorCredential,
} from "../credentials";
import { ProviderError } from "../errors";
import type { FetchClient } from "../provider";
import { TeamtailorProvider } from "../providers/teamtailor";

const PROVIDER_ID = "teamtailor";

async function connector(database: PrismaClient, connectorId: string) {
  const value = await database.companyConnector.findUnique({
    where: { id: connectorId },
  });
  if (!value || value.atsType !== PROVIDER_ID) {
    throw new ProviderError(
      "INVALID_CONFIGURATION",
      "A valid Teamtailor connector is required.",
      { providerId: PROVIDER_ID, connectorId },
    );
  }
  return value;
}

function context(value: Awaited<ReturnType<typeof connector>>) {
  return {
    connectorId: value.id,
    company: value.company,
    careerUrl: value.careerUrl,
    connectorKey: value.connectorKey,
    enabled: true,
    robotsPolicy: value.robotsPolicy,
    credentialRegion: value.credentialRegion,
  };
}

export async function configureTeamtailorCredential(
  database: PrismaClient,
  input: {
    connectorId: string;
    apiKey: string;
    region: "eu" | "na";
    apiVersion?: string;
  },
  options: {
    store?: ProviderCredentialStore;
    client?: FetchClient;
  } = {},
) {
  const target = await connector(database, input.connectorId);
  const credential: TeamtailorCredential = {
    apiKey: input.apiKey,
    region: input.region,
    apiVersion: input.apiVersion ?? "20240404",
  };
  const temporary = new MemoryCredentialStore();
  await temporary.set(PROVIDER_ID, target.id, credential);
  await new TeamtailorProvider(options.client ?? fetch, temporary)
    .validateAuthentication({ ...context(target), credentialRegion: input.region });

  const store = options.store ?? providerCredentialStore;
  const previous = await store.get(PROVIDER_ID, target.id);
  await store.set(PROVIDER_ID, target.id, credential);
  const checkedAt = new Date();
  try {
    await database.companyConnector.update({
      where: { id: target.id },
      data: {
        enabled: true,
        health: "Healthy",
        credentialStatus: "Valid",
        credentialCheckedAt: checkedAt,
        credentialRegion: input.region,
        notes: null,
      },
    });
  } catch (error) {
    if (previous) await store.set(PROVIDER_ID, target.id, previous);
    else await store.remove(PROVIDER_ID, target.id);
    throw error;
  }
  return { status: "Valid" as const, checkedAt, region: input.region };
}

export async function testTeamtailorCredential(
  database: PrismaClient,
  connectorId: string,
  options: {
    store?: ProviderCredentialStore;
    client?: FetchClient;
  } = {},
) {
  const target = await connector(database, connectorId);
  const checkedAt = new Date();
  try {
    const result = await new TeamtailorProvider(
      options.client ?? fetch,
      options.store ?? providerCredentialStore,
    ).validateAuthentication(context(target));
    await database.companyConnector.update({
      where: { id: target.id },
      data: {
        enabled: true,
        health: "Healthy",
        credentialStatus: "Valid",
        credentialCheckedAt: checkedAt,
        notes: null,
      },
    });
    return result;
  } catch (error) {
    const expired = error instanceof ProviderError && error.code === "AUTH_EXPIRED";
    await database.companyConnector.update({
      where: { id: target.id },
      data: {
        enabled: false,
        health: "Warning",
        credentialStatus: expired ? "Expired" : "Missing",
        credentialCheckedAt: checkedAt,
      },
    });
    throw error;
  }
}

export async function removeTeamtailorCredential(
  database: PrismaClient,
  connectorId: string,
  store: ProviderCredentialStore = providerCredentialStore,
) {
  const target = await connector(database, connectorId);
  await store.remove(PROVIDER_ID, target.id);
  await database.companyConnector.update({
    where: { id: target.id },
    data: {
      enabled: false,
      health: "Disabled",
      credentialStatus: "Missing",
      credentialCheckedAt: new Date(),
      credentialRegion: null,
      notes: null,
    },
  });
}
