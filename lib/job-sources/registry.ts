import type { JobSourceProvider } from "./provider";
import { AshbyProvider } from "./providers/ashby";
import { GreenhouseProvider } from "./providers/greenhouse";
import { LeverProvider } from "./providers/lever";
import { SmartRecruitersProvider } from "./providers/smartrecruiters";
import { WorkableProvider } from "./providers/workable";
import { WorkdayProvider } from "./providers/workday";
import { RecruiteeProvider } from "./providers/recruitee";
import { ComeetProvider } from "./providers/comeet";
import { PersonioProvider } from "./providers/personio";
import { JobScoreProvider } from "./providers/jobscore";
import { TeamtailorProvider } from "./providers/teamtailor";
import { JobviteProvider } from "./providers/jobvite";

export class JobSourceRegistry {
  private readonly providers = new Map<string, JobSourceProvider>();

  register(provider: JobSourceProvider) {
    if (this.providers.has(provider.id)) {
      throw new Error(`Job source provider "${provider.id}" is already registered.`);
    }
    this.providers.set(provider.id, provider);
    return this;
  }

  get(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown job source provider "${providerId}".`);
    }
    return provider;
  }

  list() {
    return [...this.providers.values()];
  }
}

export function createJobSourceRegistry() {
  return new JobSourceRegistry()
    .register(new GreenhouseProvider())
    .register(new LeverProvider())
    .register(new AshbyProvider())
    .register(new WorkableProvider())
    .register(new SmartRecruitersProvider())
    .register(new RecruiteeProvider())
    .register(new ComeetProvider())
    .register(new PersonioProvider())
    .register(new JobScoreProvider())
    .register(new TeamtailorProvider())
    .register(new JobviteProvider())
    .register(new WorkdayProvider());
}

export const jobSourceRegistry = createJobSourceRegistry();
