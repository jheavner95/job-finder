import { describe, expect, it, vi } from "vitest";

import { evaluateRoleRelevance } from "../lib/job-sources/role-relevance";
import { JsonJobProvider, type GenericPosting } from "../lib/job-sources/providers/json-provider";
import type { ProviderContext } from "../lib/job-sources/types";

/**
 * Harvested live from real boards. Discovery must retrieve every one of these:
 * recall is the product requirement, ranking happens downstream.
 */
const MUST_KEEP = [
  "Product Designer",
  "Senior Product Designer",
  "Staff Product Designer",
  "Principal Product Designer",
  "Lead Product Designer",
  "Product Designer II",
  "Product Designer (8+ YOE)",
  "Product Designer, Payments",
  "Product Designer, Growth & Monetization",
  "Sr. Product Designer, AI/BI",
  "Senior / Staff Product Designer",
  "Senior Staff Product Designer, Risk",
  "Mobile Product Designer",
  "Director, Product Design",
  "Manager, Product Design",
  "Product Design Manager, Global Payments",
  "Head of Product Design",
  "Director of Design",
  "Design Lead",
  "Product Design Lead",
  "Lead Designer",
  "Staff Designer",
  "Principal Designer",
  "Senior Designer",
  "Senior Designer, Product",
  "Designer, Web Presence & Platform",
  "Senior UX Designer",
  "Staff UX Designer",
  "Principal UX Designer",
  "UX/UI Designer",
  "Senior UX/Product Designer",
  "Senior Experience Designer",
  "Experience Designer",
  "Senior Interaction Designer",
  "Staff Interaction Designer",
  "Senior Service Designer",
  "Senior Design Technologist",
  "UX Architect",
  "Senior Digital Product Designer",
  "Digital Product Designer",
  "Design Manager",
  "Senior Designer - Design Systems",
  "Product Designer (Design Systems)",
];

const MUST_DROP = [
  "Senior Software Engineer",
  "Product Manager",
  "Senior Product Manager",
  "Graphic Designer",
  "Accountant",
  "Motion Designer",
  "Brand Designer",
  "Visual Designer, Product Creative",
  "Production Designer",
  "Model Designer",
  "BIM Coordinator",
  "BIM Designer",
  "Designer Advocate",
  "Design Engineer",
  "Full Stack Engineer, Developer & End User Experience Platform",
  "Senior Android Engineer, Design System",
  "Product Design Intern",
  "UX Design Intern",
  "Instructional Designer",
  "Game Designer",
  "Solution Designer",
  "Payroll Specialist",
  "Account Executive DACH",
];

describe("evaluateRoleRelevance", () => {
  it("covers the full harvested must-keep corpus", () => {
    expect(MUST_KEEP).toHaveLength(43);
  });

  it.each(MUST_KEEP)("keeps %s", (title) => {
    const result = evaluateRoleRelevance(title);
    expect(result.relevant).toBe(true);
    expect(result.rejectedBy).toBeUndefined();
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.detail).not.toBe("");
  });

  it.each(MUST_DROP)("drops %s", (title) => {
    const result = evaluateRoleRelevance(title);
    expect(result.relevant).toBe(false);
    expect(result.rejectedBy).toBeDefined();
    expect(result.detail).not.toBe("");
  });

  it("retrieves the entire must-keep corpus", () => {
    const kept = MUST_KEEP.filter((title) => evaluateRoleRelevance(title).relevant);
    expect(kept).toHaveLength(MUST_KEEP.length);
  });

  it("classifies why a posting was dropped", () => {
    expect(evaluateRoleRelevance("Senior Software Engineer").rejectedBy)
      .toBe("unrelated-discipline");
    expect(evaluateRoleRelevance("Graphic Designer").rejectedBy)
      .toBe("unrelated-discipline");
    expect(evaluateRoleRelevance("Design Engineer").rejectedBy)
      .toBe("unrelated-discipline");
    expect(evaluateRoleRelevance("Product Design Intern").rejectedBy)
      .toBe("excluded-seniority");
    expect(evaluateRoleRelevance("Werkstudent Produktdesign").rejectedBy)
      .toBe("excluded-seniority");
    expect(evaluateRoleRelevance("Product Manager").rejectedBy)
      .toBe("no-design-signal");
    expect(evaluateRoleRelevance("").rejectedBy).toBe("no-design-signal");
  });

  it("never drops on seniority, level, or locale noise", () => {
    for (const title of [
      "Junior Product Designer",
      "Associate Product Designer",
      "Product Designer I",
      "Product Designer II",
      "Product Designer (Hybrid, Berlin)",
      "Product Designer — Contract",
      "SENIOR PRODUCT DESIGNER",
      "senior product designers",
      "Snr Product Designer",
      "Sr Product Designer",
    ]) {
      expect(evaluateRoleRelevance(title).relevant, title).toBe(true);
    }
  });

  it("keeps design ops but drops design advocacy", () => {
    expect(evaluateRoleRelevance("Design Ops Manager").relevant).toBe(true);
    expect(evaluateRoleRelevance("Design Operations Lead").relevant).toBe(true);
    expect(evaluateRoleRelevance("Design Advocate").relevant).toBe(false);
    expect(evaluateRoleRelevance("Designer Advocate").relevant).toBe(false);
  });

  it("keeps UX architects but drops every other architect", () => {
    expect(evaluateRoleRelevance("UX Architect").relevant).toBe(true);
    expect(evaluateRoleRelevance("Solutions Architect").relevant).toBe(false);
    expect(evaluateRoleRelevance("Enterprise Architect").relevant).toBe(false);
    expect(evaluateRoleRelevance("Landscape Architect").relevant).toBe(false);
  });

  it("matches on word boundaries only", () => {
    expect(evaluateRoleRelevance("Redesigner Tooling Specialist").relevant).toBe(false);
    expect(evaluateRoleRelevance("Internal Communications Manager").relevant).toBe(false);
  });

  it("lets a design department corroborate a design term in the title", () => {
    expect(evaluateRoleRelevance("Design Researcher").relevant).toBe(false);
    expect(
      evaluateRoleRelevance("Design Researcher", { department: "Product Design" }).relevant,
    ).toBe(true);
    expect(
      evaluateRoleRelevance("Technical Recruiter", { department: "Product Design" }).relevant,
    ).toBe(false);
  });
});

class TestJsonProvider extends JsonJobProvider {
  readonly id = "workable";
  readonly name = "Test JSON provider";

  protected discoveryUrl() {
    return "https://example.com/jobs.json";
  }

  protected postings(payload: unknown) {
    return (payload as { jobs: unknown[] }).jobs;
  }

  protected mapPosting(payload: unknown): GenericPosting {
    const job = payload as Record<string, string>;
    return {
      id: job.id,
      title: job.title,
      location: job.location,
      url: job.url,
      description: "",
      salary: "",
      employmentType: "",
      raw: payload,
    };
  }
}

const context: ProviderContext = {
  company: "Example Products",
  careerUrl: "https://example.com/careers",
  connectorKey: "example",
  robotsPolicy: "allow",
};

describe("JSON provider retrieval regression", () => {
  it("keeps a broader real title than the saved search variant", async () => {
    const client = vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({
        jobs: [
          {
            id: "1",
            title: "Product Designer",
            location: "Remote",
            url: "https://example.com/jobs/1",
          },
          {
            id: "2",
            title: "Senior Software Engineer",
            location: "Remote",
            url: "https://example.com/jobs/2",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    const result = await new TestJsonProvider(client).discoverDetailed(
      { titles: ["Senior Product Designer"], locations: [] },
      context,
    );
    expect(result.jobs.map((job) => job.title)).toEqual(["Product Designer"]);
    expect(result.diagnostics).toMatchObject({
      totalJobsDiscovered: 2,
      titleMatches: 1,
      excludedByTitle: 1,
    });
    expect(result.diagnostics.excludedJobs).toHaveLength(1);
    expect(result.diagnostics.excludedJobs[0]).toMatchObject({
      title: "Senior Software Engineer",
      reason: "title",
      excludedTitleTerms: ["unrelated-discipline"],
    });
    expect(result.diagnostics.excludedJobs[0].detail).toContain("different discipline");
  });
});

describe("engineering-family terms as domain qualifiers, not the role", () => {
  // Regression: "Product Designer, Engineering Acceleration" (OpenAI) was
  // dropped because "engineering" was an unconditional discipline exclusion,
  // even though the title plainly names a product design role.
  const keep = [
    "Product Designer, Engineering Acceleration",
    "Senior Product Designer - Engineering Productivity",
    "Staff Product Designer, Developer Platform",
    "Lead Product Designer - AI Infrastructure",
    "Senior Product Designer - Developer Experience",
    "Product Designer, Data Platform",
    "Senior UX Designer, Developer Tools",
    "Principal Product Designer, Developer Experience",
    "Staff Interaction Designer, Engineering Systems",
  ];
  it.each(keep)("keeps %s", (title) => {
    expect(evaluateRoleRelevance(title).relevant).toBe(true);
  });

  // The title must still establish product design as the role. An
  // engineering-family head noun stays excluded no matter what modifies it.
  const drop = [
    "Software Engineer",
    "Engineering Manager",
    "Product Engineer",
    "Design Engineer",
    "Mechanical Design Engineer",
    "Engineering Designer",
    "Senior Design Engineer",
    "Product Design Engineer",
    "Senior Software Engineer, Design Systems",
  ];
  it.each(drop)("drops %s", (title) => {
    const result = evaluateRoleRelevance(title);
    expect(result.relevant).toBe(false);
    expect(result.rejectedBy).toBe("unrelated-discipline");
  });

  it("does not relax non-engineering discipline exclusions", () => {
    // CAD, BIM and advocate are never overridable, even beside a design role.
    for (const title of ["Product Designer Advocate", "Product Designer, CAD Tooling"]) {
      expect(evaluateRoleRelevance(title).relevant, title).toBe(false);
    }
  });

  it("still drops craft titles that name a designer role", () => {
    for (const title of ["Graphic Designer", "Motion Designer", "Marketing Designer"]) {
      expect(evaluateRoleRelevance(title).relevant, title).toBe(false);
    }
  });
});
