import { describe, expect, it, vi } from "vitest";

import { AshbyProvider } from "../lib/job-sources/providers/ashby";
import { ComeetProvider } from "../lib/job-sources/providers/comeet";
import { GreenhouseProvider } from "../lib/job-sources/providers/greenhouse";
import { JobScoreProvider } from "../lib/job-sources/providers/jobscore";
import { LeverProvider } from "../lib/job-sources/providers/lever";
import { PersonioProvider } from "../lib/job-sources/providers/personio";
import { RecruiteeProvider } from "../lib/job-sources/providers/recruitee";
import { SmartRecruitersProvider } from "../lib/job-sources/providers/smartrecruiters";
import { WorkableProvider } from "../lib/job-sources/providers/workable";
import { executeProviderRequest } from "../lib/job-sources/request-policy";
import type { ProviderContext } from "../lib/job-sources/types";
import {
  OPERATIONAL_PROVIDER_CAPABILITIES,
} from "../lib/job-sources/capabilities";
import { createJobSourceRegistry } from "../lib/job-sources/registry";
import { PROVIDER_ERROR_CODES } from "../lib/job-sources/errors";
import { certifyProviderContract } from "./provider-contract-harness";
import { jobScoreSingleJob } from "./fixtures/jobscore";
import { personioSingleJob } from "./fixtures/personio";

const baseContext: ProviderContext = {
  company: "Contract Company",
  careerUrl: "https://example.test/jobs",
  connectorKey: "example",
  enabled: true,
  robotsPolicy: "allow",
};

const json = (value: unknown) => JSON.stringify(value);
const canonical = {
  greenhouse: "https://boards.greenhouse.io/example/jobs/gh-1",
  lever: "https://jobs.lever.co/example/lev-1",
  ashby: "https://jobs.ashbyhq.com/example/ash-1",
  smartrecruiters: "https://jobs.smartrecruiters.com/Example/sr-1-product-designer",
  workable: "https://apply.workable.com/j/work-1",
  recruitee: "https://example.recruitee.com/o/product-designer",
  comeet: "https://www.comeet.co/jobs/example/product-designer/com-1",
};

describe("universal public provider contract", () => {
  it("requires every registered public provider to declare operational capabilities", () => {
    const registered = createJobSourceRegistry().list()
      .map((provider) => provider.id)
      .filter((providerId) => providerId !== "workday")
      .sort();
    const declared = OPERATIONAL_PROVIDER_CAPABILITIES
      .filter((capability) => capability.providerId !== "workday")
      .map((capability) => capability.providerId)
      .sort();
    expect(declared).toEqual(registered);
    expect(PROVIDER_ERROR_CODES).toEqual(expect.arrayContaining([
      "TIMEOUT", "NETWORK", "RATE_LIMITED", "RETRY_AFTER", "MALFORMED_FEED",
      "SCHEMA_DRIFT", "MISSING_ID", "DUPLICATE_ID", "ROBOTS_DENIED",
      "AUTH_REQUIRED", "AUTH_EXPIRED", "INVALID_CONFIGURATION", "DELETED",
      "UNEXPECTED_RESPONSE",
    ]));
  });

  it.each([
    {
      providerId: "greenhouse",
      createProvider: (client: typeof fetch) => new GreenhouseProvider(client),
      context: { ...baseContext, careerUrl: "https://boards.greenhouse.io/example" },
      sourceJobId: "gh-1",
      canonicalUrl: canonical.greenhouse,
      discoveryBody: json({ jobs: [{
        id: "gh-1", title: "Product Designer", absolute_url: canonical.greenhouse,
        location: { name: "Remote" }, content: "Design products.",
      }] }),
      detailBody: json({
        id: "gh-1", title: "Product Designer", absolute_url: canonical.greenhouse,
        location: { name: "Remote" }, content: "Design products.",
      }),
    },
    {
      providerId: "lever",
      createProvider: (client: typeof fetch) => new LeverProvider(client),
      context: { ...baseContext, careerUrl: "https://jobs.lever.co/example" },
      sourceJobId: "lev-1",
      canonicalUrl: canonical.lever,
      discoveryBody: json([{
        id: "lev-1", text: "Product Designer", hostedUrl: canonical.lever,
        descriptionPlain: "Design products.", categories: { location: "Remote" },
      }]),
      detailBody: json({
        id: "lev-1", text: "Product Designer", hostedUrl: canonical.lever,
        descriptionPlain: "Design products.", categories: { location: "Remote" },
      }),
    },
    {
      providerId: "ashby",
      createProvider: (client: typeof fetch) => new AshbyProvider(client),
      context: { ...baseContext, careerUrl: "https://jobs.ashbyhq.com/example" },
      sourceJobId: "ash-1",
      canonicalUrl: canonical.ashby,
      discoveryBody: json({ jobs: [{
        id: "ash-1", title: "Product Designer", jobUrl: canonical.ashby,
        location: "Remote", descriptionPlain: "Design products.", isListed: true,
      }] }),
    },
    {
      providerId: "smartrecruiters",
      createProvider: (client: typeof fetch) => new SmartRecruitersProvider(client),
      context: { ...baseContext, connectorKey: "Example", careerUrl: "https://jobs.smartrecruiters.com/Example" },
      sourceJobId: "sr-1",
      canonicalUrl: canonical.smartrecruiters,
      discoveryBody: json({ content: [{
        id: "sr-1", name: "Product Designer", company: { identifier: "Example" },
        location: { fullLocation: "Remote" }, jobAd: { job: { text: "Design products." } },
      }] }),
      detailBody: json({
        id: "sr-1", name: "Product Designer", company: { identifier: "Example" },
        location: { fullLocation: "Remote" }, jobAd: { job: { text: "Design products." } },
      }),
    },
    {
      providerId: "workable",
      createProvider: (client: typeof fetch) => new WorkableProvider(client),
      context: { ...baseContext, careerUrl: "https://apply.workable.com/example" },
      sourceJobId: "work-1",
      canonicalUrl: canonical.workable,
      discoveryBody: json({ jobs: [{
        shortcode: "work-1", title: "Product Designer", url: canonical.workable,
        description: "Design products.", workplace_type: "remote",
      }] }),
    },
    {
      providerId: "recruitee",
      createProvider: (client: typeof fetch) => new RecruiteeProvider(client),
      context: { ...baseContext, careerUrl: "https://example.recruitee.com" },
      sourceJobId: "product-designer",
      canonicalUrl: canonical.recruitee,
      discoveryBody: json({ offers: [{
        id: 1, slug: "product-designer", title: "Product Designer",
        careers_url: canonical.recruitee, description: "Design products.", remote: true,
      }] }),
      detailBody: json({ offer: {
        id: 1, slug: "product-designer", title: "Product Designer",
        careers_url: canonical.recruitee, description: "Design products.", remote: true,
      } }),
    },
    {
      providerId: "comeet",
      createProvider: (client: typeof fetch) => new ComeetProvider(client),
      context: { ...baseContext, connectorKey: "company:token", careerUrl: "https://www.comeet.co/jobs/example" },
      sourceJobId: "com-1",
      canonicalUrl: canonical.comeet,
      discoveryBody: json({ positions: [{
        uid: "com-1", name: "Product Designer", url_recruit_hosted_page: canonical.comeet,
        location: { name: "Remote" }, details: [{ name: "Description", value: "Design products." }],
      }] }),
    },
    {
      providerId: "personio",
      createProvider: (client: typeof fetch) => new PersonioProvider(client),
      context: { ...baseContext, careerUrl: "https://example.jobs.personio.de/?language=en" },
      sourceJobId: "4103",
      canonicalUrl: "https://example.jobs.personio.de/job/4103",
      discoveryBody: personioSingleJob,
    },
    {
      providerId: "jobscore",
      createProvider: (client: typeof fetch) => new JobScoreProvider(client),
      context: { ...baseContext, careerUrl: "https://careers.jobscore.com/jobs/example" },
      sourceJobId: "JS-101",
      canonicalUrl: "https://careers.jobscore.com/careers/example/jobs/JS-101",
      discoveryBody: json(jobScoreSingleJob),
    },
  ])("certifies $providerId", async (contract) => {
    await certifyProviderContract(contract);
  });

  it("classifies shared timeout, network, and Retry-After behavior", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const timeoutClient = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    await expect(executeProviderRequest({
      providerId: "greenhouse",
      client: timeoutClient,
      url: "https://example.test/feed",
      context: baseContext,
      responseType: "json",
      runtime: { sleep: async () => undefined, random: () => 0 },
    })).rejects.toMatchObject({ code: "TIMEOUT" });

    const sleeps: number[] = [];
    const retryClient = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await executeProviderRequest({
      providerId: "greenhouse",
      client: retryClient,
      url: "https://example.test/feed",
      context: baseContext,
      responseType: "json",
      runtime: { sleep: async (value) => { sleeps.push(value); }, random: () => 0, now: () => 0 },
    });
    expect(sleeps).toEqual([2_000]);
  });
});
