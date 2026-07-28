import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ProviderError } from "./errors";

const execFileAsync = promisify(execFile);
const SERVICE = "job-finder.discovery-credentials";

export type TeamtailorCredential = {
  apiKey: string;
  region: "eu" | "na";
  apiVersion: string;
};

export type ProviderCredentialStore = {
  get(providerId: string, connectorId: string): Promise<TeamtailorCredential | null>;
  set(providerId: string, connectorId: string, credential: TeamtailorCredential): Promise<void>;
  remove(providerId: string, connectorId: string): Promise<void>;
};

function account(providerId: string, connectorId: string) {
  return `${providerId}:${connectorId}`;
}

function validateCredential(value: TeamtailorCredential) {
  if (!value.apiKey.trim()) {
    throw new ProviderError("INVALID_CONFIGURATION", "A Teamtailor API key is required.");
  }
  if (!["eu", "na"].includes(value.region)) {
    throw new ProviderError("INVALID_CONFIGURATION", "A valid Teamtailor data region is required.");
  }
  if (!/^\d{8}$/.test(value.apiVersion)) {
    throw new ProviderError("INVALID_CONFIGURATION", "Teamtailor API version must use YYYYMMDD.");
  }
  return {
    apiKey: value.apiKey.trim(),
    region: value.region,
    apiVersion: value.apiVersion,
  };
}

export class MacKeychainCredentialStore implements ProviderCredentialStore {
  async get(providerId: string, connectorId: string) {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s", SERVICE,
        "-a", account(providerId, connectorId),
        "-w",
      ], { encoding: "utf8" });
      return validateCredential(JSON.parse(stdout.trim()) as TeamtailorCredential);
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 44) return null;
      throw new ProviderError(
        "INVALID_CONFIGURATION",
        "The local credential store could not be accessed.",
        { providerId, connectorId },
        { cause: error },
      );
    }
  }

  async set(providerId: string, connectorId: string, credential: TeamtailorCredential) {
    const value = JSON.stringify(validateCredential(credential));
    try {
      await execFileAsync("security", [
        "add-generic-password",
        "-U",
        "-s", SERVICE,
        "-a", account(providerId, connectorId),
        "-w", value,
      ]);
    } catch (error) {
      throw new ProviderError(
        "INVALID_CONFIGURATION",
        "The credential could not be saved to the local secure store.",
        { providerId, connectorId },
        { cause: error },
      );
    }
  }

  async remove(providerId: string, connectorId: string) {
    try {
      await execFileAsync("security", [
        "delete-generic-password",
        "-s", SERVICE,
        "-a", account(providerId, connectorId),
      ]);
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 44) {
        throw new ProviderError(
          "INVALID_CONFIGURATION",
          "The credential could not be removed from the local secure store.",
          { providerId, connectorId },
          { cause: error },
        );
      }
    }
  }
}

export class MemoryCredentialStore implements ProviderCredentialStore {
  private readonly values = new Map<string, TeamtailorCredential>();

  async get(providerId: string, connectorId: string) {
    return this.values.get(account(providerId, connectorId)) ?? null;
  }

  async set(providerId: string, connectorId: string, credential: TeamtailorCredential) {
    this.values.set(account(providerId, connectorId), validateCredential(credential));
  }

  async remove(providerId: string, connectorId: string) {
    this.values.delete(account(providerId, connectorId));
  }
}

export const providerCredentialStore = new MacKeychainCredentialStore();
