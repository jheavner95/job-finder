import { describe, expect, it, vi } from "vitest";

import { createJobImportPreview } from "../lib/job-import";
import { GreenhouseProvider } from "../lib/job-sources/providers/greenhouse";
import { LeverProvider } from "../lib/job-sources/providers/lever";
import { AshbyProvider } from "../lib/job-sources/providers/ashby";
import { SmartRecruitersProvider } from "../lib/job-sources/providers/smartrecruiters";
import { WorkableProvider } from "../lib/job-sources/providers/workable";
import { RecruiteeProvider } from "../lib/job-sources/providers/recruitee";
import { ComeetProvider } from "../lib/job-sources/providers/comeet";
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
        "recruitee",
        "comeet",
        "personio",
        "jobscore",
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
      providerExternalId: "123",
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
    )).rejects.toMatchObject({ code: "ROBOTS_DENIED" });
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

  it("matches Greenhouse design role variants and explains every exclusion", async () => {
    const client = vi.fn(() => response({
      jobs: [
        { ...greenhouseJob, id: 1, title: "Principal UX Designer, Enterprise AI" },
        { ...greenhouseJob, id: 2, title: "Product Design Lead — Growth Platform" },
        { ...greenhouseJob, id: 3, title: "Senior Software Engineer" },
        { ...greenhouseJob, id: 4, title: "Design Manager", location: { name: "London" } },
      ],
    }));
    const result = await new GreenhouseProvider(client).discoverDetailed(
      { titles: ["Senior Product Designer"], locations: ["Remote", "United States"] },
      context,
    );
    expect(result.jobs.map((job) => job.externalId)).toEqual(["1", "2"]);
    expect(result.diagnostics).toMatchObject({
      totalJobsDiscovered: 4,
      titleMatches: 3,
      locationMatches: 2,
      excludedByTitle: 1,
      excludedByLocation: 1,
    });
    expect(result.diagnostics.excludedJobs).toHaveLength(2);
    expect(result.diagnostics.excludedJobs.map((job) => job.reason).sort())
      .toEqual(["location", "title"]);
  });

  it("uses Recruitee's unauthenticated Careers Site API and preserves its canonical URL", async () => {
    const offer = {
      id: 71,
      slug: "staff-product-designer",
      title: "Staff Product Designer",
      description: "<p>Own an enterprise design system.</p>",
      requirements: "<p>Eight years of product design experience.</p>",
      careers_url: "https://example.recruitee.com/o/staff-product-designer",
      employment_type: "full_time",
      remote: true,
      locations: [{ country: "United States" }],
    };
    const client = vi.fn()
      .mockImplementationOnce(() => response({ offers: [offer] }))
      .mockImplementationOnce(() => response({ offer }));
    const provider = new RecruiteeProvider(client);
    const jobs = await provider.discover(
      { titles: ["Staff Product Designer"], locations: ["Remote"] },
      { ...context, connectorKey: "example", careerUrl: "https://example.recruitee.com" },
    );
    expect(jobs).toHaveLength(1);
    const normalized = provider.normalize(
      await provider.fetch(jobs[0], context),
      context,
    );
    expect(normalized.url).toBe(offer.careers_url);
    expect(normalized.providerExternalId).toBe("staff-product-designer");
    expect(provider.validate(normalized).valid).toBe(true);
  });

  it("normalizes Comeet's public Careers API posting and preserves the hosted URL", async () => {
    const position = {
      uid: "87.405",
      name: "Lead Product Designer",
      url_recruit_hosted_page: "https://www.comeet.co/jobs/example/lead-product-designer/87.405",
      location: { name: "Remote, United States" },
      employment_type: "Full-time",
      details: [
        { name: "Description", value: "<p>Lead product strategy and design systems.</p>" },
        { name: "Requirements", value: "<p>Eight years of experience.</p>" },
      ],
    };
    const client = vi.fn(() => response({ positions: [position] }));
    const provider = new ComeetProvider(client);
    const comeetContext = {
      ...context,
      company: "Comeet Example",
      connectorKey: "30.005:PUBLIC_TOKEN",
      careerUrl: "https://www.comeet.co/jobs/example",
    };
    const jobs = await provider.discover(
      { titles: ["Lead Product Designer"], locations: ["Remote"] },
      comeetContext,
    );
    const normalized = provider.normalize(
      await provider.fetch(jobs[0], comeetContext),
      comeetContext,
    );
    expect(provider.validate(normalized).valid).toBe(true);
    expect(normalized.url).toBe(position.url_recruit_hosted_page);
    expect(normalized.providerExternalId).toBe("87.405");
  });

  it("uses the most specific robots rule and reads crawl delay", () => {
    expect(evaluateRobots(
      "User-agent: *\nDisallow: /v1/\nAllow: /v1/boards/\nCrawl-delay: 2",
      "/v1/boards/example/jobs",
    )).toMatchObject({
      allowed: true,
      policy: "allow",
      crawlDelay: 2_000,
      reason: "robots.txt permits /v1/boards/example/jobs.",
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
    expect(normalized.providerExternalId).toBe("lever-123");
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

  it("fetches SmartRecruiters details from the canonical posting endpoint", async () => {
    const posting = {
      id: "744000123",
      name: "Senior Product Designer",
      company: { identifier: "ExampleCo" },
      location: { fullLocation: "Remote, United States" },
      jobAd: { job: { text: "Own product design strategy." } },
    };
    const client = vi.fn()
      .mockImplementationOnce(() => response({ content: [posting] }))
      .mockImplementationOnce(() => response(posting));
    const provider = new SmartRecruitersProvider(client);
    const smartContext = {
      ...context,
      connectorKey: "ExampleCo",
      careerUrl: "https://jobs.smartrecruiters.com/ExampleCo",
    };
    const [job] = await provider.discover(
      { titles: [], locations: [] },
      smartContext,
    );
    await provider.fetch(job, smartContext);
    expect(client).toHaveBeenLastCalledWith(
      "https://api.smartrecruiters.com/v1/companies/ExampleCo/postings/744000123",
      expect.any(Object),
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
