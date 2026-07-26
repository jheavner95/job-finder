import { describe, expect, it, vi } from "vitest";

import { createJobImportPreview } from "../lib/job-import";
import { GreenhouseProvider } from "../lib/job-sources/providers/greenhouse";
import { LeverProvider } from "../lib/job-sources/providers/lever";
import { AshbyProvider } from "../lib/job-sources/providers/ashby";
import { SmartRecruitersProvider } from "../lib/job-sources/providers/smartrecruiters";
import { WorkableProvider } from "../lib/job-sources/providers/workable";
import {
  createJobSourceRegistry,
  JobSourceRegistry,
} from "../lib/job-sources/registry";
import { evaluateRobots } from "../lib/job-sources/robots";
import type { ProviderContext } from "../lib/job-sources/types";

const context: ProviderContext = {
  company: "Example Systems",
  careerUrl: "https://boards.greenhouse.io/example",
  connectorKey: "example",
  robotsPolicy: "allow",
  crawlDelay: 1_000,
  rateLimit: 30,
  enabled: true,
};

const greenhouseJob = {
  id: 123,
  title: "Staff Product Designer",
  absolute_url: "https://boards.greenhouse.io/example/jobs/123",
  location: { name: "Remote — United States" },
  content: `<p>Lead product design strategy for an enterprise platform.</p>
    <p>Requirements</p><ul><li>8 years of product design experience</li>
    <li>Create prototypes and design systems in Figma</li></ul>`,
  metadata: [
    { name: "Employment Type", value: "Full-time" },
    { name: "Salary", value: "$180k–$220k" },
  ],
};

function response(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
}

describe("job source engine", () => {
  it("registers every initial ATS behind one provider contract", () => {
    expect(createJobSourceRegistry().list().map((provider) => provider.id))
      .toEqual([
        "greenhouse",
        "lever",
        "ashby",
        "workable",
        "smartrecruiters",
        "workday",
      ]);
  });

  it("rejects duplicate provider registration", () => {
    const provider = new GreenhouseProvider(vi.fn(response));
    expect(() => new JobSourceRegistry().register(provider).register(provider))
      .toThrow(/already registered/);
  });

  it("runs Greenhouse discovery, fetch, normalization, validation, and scoring", async () => {
    const client = vi.fn()
      .mockImplementationOnce(() => response({ jobs: [greenhouseJob] }))
      .mockImplementationOnce(() => response(greenhouseJob));
    const provider = new GreenhouseProvider(client);
    const jobs = await provider.discover(
      { titles: ["Staff Product Designer"], locations: ["Remote"] },
      context,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].canonicalUrl).toContain("boards.greenhouse.io");

    const posting = await provider.fetch(jobs[0], context);
    const normalized = provider.normalize(posting, context);
    expect(provider.validate(normalized)).toEqual({ valid: true, errors: [] });
    expect(normalized).toMatchObject({
      title: "Staff Product Designer",
      company: "Example Systems",
      source: "Greenhouse",
      salary: "$180k–$220k",
      employmentType: "Full-time",
    });

    const preview = createJobImportPreview(normalized);
    expect(preview.normalized.sourceUrl).toBe(greenhouseJob.absolute_url);
    expect(preview.evaluation.score).toBeGreaterThan(0);
    expect(preview.evaluation.confidence).toBeGreaterThan(0);
  });

  it("decodes Greenhouse escaped HTML before normalization", () => {
    const provider = new GreenhouseProvider(vi.fn(response));
    const normalized = provider.normalize({
      providerId: "greenhouse",
      externalId: "123",
      canonicalUrl: greenhouseJob.absolute_url,
      payload: {
        ...greenhouseJob,
        content: "&lt;p&gt;Design &amp;amp; research&lt;/p&gt;",
      },
      fetchedAt: new Date(),
    }, context);
    expect(normalized.description).toBe("Design & research");
  });

  it("honors disabled connectors and robots disallow policies", async () => {
    const provider = new GreenhouseProvider(vi.fn(response));
    await expect(provider.discover(
      { titles: [], locations: [] },
      { ...context, robotsPolicy: "disallow" },
    )).rejects.toThrow(/Robots policy/);
    expect((await provider.health({ ...context, enabled: false })).status)
      .toBe("Disabled");
  });

  it("filters unrelated Greenhouse roles before canonical fetch", async () => {
    const client = vi.fn(() => response({
      jobs: [
        greenhouseJob,
        {
          ...greenhouseJob,
          id: 456,
          title: "Senior Software Engineer",
          absolute_url: "https://boards.greenhouse.io/example/jobs/456",
        },
      ],
    }));
    const provider = new GreenhouseProvider(client);
    const jobs = await provider.discover(
      {
        titles: ["Staff Product Designer"],
        locations: ["Remote", "United States"],
      },
      context,
    );
    expect(jobs.map((job) => job.externalId)).toEqual(["123"]);
  });

  it("uses the most specific robots rule and reads crawl delay", () => {
    expect(evaluateRobots(
      "User-agent: *\nDisallow: /v1/\nAllow: /v1/boards/\nCrawl-delay: 2",
      "/v1/boards/example/jobs",
    )).toMatchObject({
      allowed: true,
      policy: "allow",
      crawlDelay: 2_000,
    });
    expect(evaluateRobots(
      "User-agent: *\nDisallow: /v1/boards/",
      "/v1/boards/example/jobs",
    ).allowed).toBe(false);
  });

  it("normalizes a canonical Lever posting through the same import model", async () => {
    const leverJob = {
      id: "lever-123",
      text: "Senior Product Designer",
      hostedUrl: "https://jobs.lever.co/example/lever-123",
      descriptionPlain: "Own product design strategy for a complex platform.",
      categories: { location: "Remote - USA", commitment: "Full-time" },
      lists: [{ text: "Requirements", content: "8 years of product design experience" }],
      salaryRange: { currency: "USD", min: 180000, max: 220000 },
    };
    const client = vi.fn()
      .mockImplementationOnce(() => response([leverJob]))
      .mockImplementationOnce(() => response(leverJob));
    const provider = new LeverProvider(client);
    const jobs = await provider.discover(
      { titles: ["Senior Product Designer"], locations: ["Remote"] },
      { ...context, connectorKey: "example", careerUrl: "https://jobs.lever.co/example" },
    );
    const posting = await provider.fetch(jobs[0], context);
    const normalized = provider.normalize(posting, context);
    expect(provider.validate(normalized).valid).toBe(true);
    expect(normalized.url).toBe(leverJob.hostedUrl);
    expect(normalized.description).toContain("8 years of product design experience");
    expect(createJobImportPreview(normalized).evaluation.score).toBeGreaterThan(0);
  });

  it("normalizes a listed Ashby posting and preserves its job URL", async () => {
    const ashbyJob = {
      id: "ashby-123",
      title: "Senior Product Designer",
      location: "United States",
      workplaceType: "Remote",
      isListed: true,
      employmentType: "FullTime",
      jobUrl: "https://jobs.ashbyhq.com/example/ashby-123",
      descriptionPlain: "Lead product design strategy and create prototypes.",
      compensation: { compensationTierSummary: "$180k–$220k" },
    };
    const client = vi.fn(() => response({ jobs: [ashbyJob] }));
    const provider = new AshbyProvider(client);
    const jobs = await provider.discover(
      { titles: ["Senior Product Designer"], locations: ["Remote"] },
      { ...context, connectorKey: "example", careerUrl: "https://jobs.ashbyhq.com/example" },
    );
    const normalized = provider.normalize(
      await provider.fetch(jobs[0], context),
      context,
    );
    expect(provider.validate(normalized).valid).toBe(true);
    expect(normalized.url).toBe(ashbyJob.jobUrl);
    expect(normalized.location).toContain("Remote");
    expect(normalized.salary).toBe("$180k–$220k");
  });

  it("builds a canonical SmartRecruiters posting URL", () => {
    const provider = new SmartRecruitersProvider(vi.fn(response));
    const normalized = provider.normalize({
      providerId: "smartrecruiters",
      externalId: "744000123",
      canonicalUrl: "",
      fetchedAt: new Date(),
      payload: {
        id: "744000123",
        name: "Senior Product Designer",
        company: { identifier: "ExampleCo" },
        location: { fullLocation: "Remote, United States" },
        typeOfEmployment: { label: "Full-time" },
        jobAd: {
          job: { title: "Role", text: "Own product design strategy." },
          qualifications: { title: "Qualifications", text: "8 years of experience." },
        },
      },
    }, context);
    expect(provider.validate(normalized).valid).toBe(true);
    expect(normalized.url).toBe(
      "https://jobs.smartrecruiters.com/ExampleCo/744000123-senior-product-designer",
    );
  });

  it("runs Workable discovery, refetch, normalization, and canonical URL preservation", async () => {
    const workableJob = {
      title: "Senior Product Designer",
      shortcode: "ABC123",
      employment_type: "Full-time",
      workplace_type: "remote",
      telecommuting: true,
      city: "Kansas City",
      state: "Missouri",
      country: "United States",
      url: "https://apply.workable.com/j/ABC123",
      application_url: "https://apply.workable.com/j/ABC123/apply",
      description: "<p>Lead product design strategy.</p><p>8 years of experience and Figma.</p>",
    };
    const client = vi.fn<typeof fetch>(() => response({ jobs: [workableJob] }));
    const provider = new WorkableProvider(client);
    const workableContext = {
      ...context,
      company: "Workable Example",
      careerUrl: "https://apply.workable.com/example/",
      connectorKey: "example",
    };
    const jobs = await provider.discover(
      { titles: ["Senior Product Designer"], locations: ["Remote"] },
      workableContext,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].canonicalUrl).toBe(workableJob.url);

    const normalized = provider.normalize(
      await provider.fetch(jobs[0], workableContext),
      workableContext,
    );
    expect(provider.validate(normalized)).toEqual({ valid: true, errors: [] });
    expect(normalized).toMatchObject({
      title: workableJob.title,
      company: workableContext.company,
      url: workableJob.url,
      source: "Workable",
      employmentType: "Full-time",
    });
    expect(normalized.location).toContain("Remote");
    expect(normalized.description).toContain("8 years of experience");
    expect(client).toHaveBeenCalledTimes(2);
    expect(String(client.mock.calls[0][0])).toBe(
      "https://www.workable.com/api/accounts/example?details=true",
    );
  });
});
