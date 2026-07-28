import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ProviderError } from "./errors";

const execFileAsync = promisify(execFile);
const SERVICE = "job-finder.discovery-employer-feeds";

export type EmployerFeedConfiguration = {
  url: string;
  employerId: string;
  schemaVersion: "jobvite-v2";
};

export type EmployerFeedStore = {
  get(providerId: string, connectorId: string): Promise<EmployerFeedConfiguration | null>;
  set(providerId: string, connectorId: string, value: EmployerFeedConfiguration): Promise<void>;
  remove(providerId: string, connectorId: string): Promise<void>;
};

function account(providerId: string, connectorId: string) {
  return `${providerId}:${connectorId}`;
}

export function validateEmployerFeedConfiguration(value: EmployerFeedConfiguration) {
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new ProviderError("INVALID_CONFIGURATION", "A valid employer feed URL is required.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new ProviderError(
      "INVALID_CONFIGURATION",
      "Employer feeds must use HTTPS without URL user information or fragments.",
    );
  }
  if (!value.employerId.trim()) {
    throw new ProviderError("INVALID_CONFIGURATION", "A Jobvite employer ID is required.");
  }
  if (value.schemaVersion !== "jobvite-v2") {
    throw new ProviderError("SCHEMA_DRIFT", "The Jobvite feed version is not supported.");
  }
  return {
    url: url.toString(),
    employerId: value.employerId.trim(),
    schemaVersion: value.schemaVersion,
  } satisfies EmployerFeedConfiguration;
}

export class MacKeychainEmployerFeedStore implements EmployerFeedStore {
  async get(providerId: string, connectorId: string) {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password", "-s", SERVICE,
        "-a", account(providerId, connectorId), "-w",
      ], { encoding: "utf8" });
      return validateEmployerFeedConfiguration(
        JSON.parse(stdout.trim()) as EmployerFeedConfiguration,
      );
    } catch (error) {
      if ((error as { code?: number }).code === 44) return null;
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        "INVALID_CONFIGURATION",
        "The local employer feed store could not be accessed.",
        { providerId, connectorId },
        { cause: error },
      );
    }
  }

  async set(providerId: string, connectorId: string, configuration: EmployerFeedConfiguration) {
    const value = JSON.stringify(validateEmployerFeedConfiguration(configuration));
    try {
      await execFileAsync("security", [
        "add-generic-password", "-U", "-s", SERVICE,
        "-a", account(providerId, connectorId), "-w", value,
      ]);
    } catch (error) {
      throw new ProviderError(
        "INVALID_CONFIGURATION",
        "The employer feed could not be saved to the local secure store.",
        { providerId, connectorId },
        { cause: error },
      );
    }
  }

  async remove(providerId: string, connectorId: string) {
    try {
      await execFileAsync("security", [
        "delete-generic-password", "-s", SERVICE,
        "-a", account(providerId, connectorId),
      ]);
    } catch (error) {
      if ((error as { code?: number }).code !== 44) {
        throw new ProviderError(
          "INVALID_CONFIGURATION",
          "The employer feed could not be removed from the local secure store.",
          { providerId, connectorId },
          { cause: error },
        );
      }
    }
  }
}

export class MemoryEmployerFeedStore implements EmployerFeedStore {
  private readonly values = new Map<string, EmployerFeedConfiguration>();

  async get(providerId: string, connectorId: string) {
    return this.values.get(account(providerId, connectorId)) ?? null;
  }

  async set(providerId: string, connectorId: string, value: EmployerFeedConfiguration) {
    this.values.set(account(providerId, connectorId), validateEmployerFeedConfiguration(value));
  }

  async remove(providerId: string, connectorId: string) {
    this.values.delete(account(providerId, connectorId));
  }
}

export const employerFeedStore = new MacKeychainEmployerFeedStore();
