import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseResumeStructure } from "../lib/candidate-intelligence/resume-structure";

function fixture(name: string) {
  return readFileSync(join(process.cwd(), "tests", "fixtures", "resumes", name), "utf8");
}

describe("resume structure parsing", () => {
  it("parses an employer and title on one line", () => {
    const parsed = parseResumeStructure(fixture("employer-title-one-line.txt"));
    expect(parsed.experience).toHaveLength(1);
    expect(parsed.experience[0]).toMatchObject({
      employer: "Northstar Works",
      title: "Senior Product Designer",
      startDate: "Jan 2022",
      endDate: "Present",
      location: "Remote",
      confidence: "High confidence",
      needsReview: false,
    });
  });

  it("parses title and employer on separate lines", () => {
    const parsed = parseResumeStructure(fixture("title-employer-separate-lines.txt"));
    expect(parsed.experience[0]).toMatchObject({
      employer: "Cedar Grove Software",
      title: "Principal Product Designer",
      startDate: "January 2020",
      endDate: "December 2023",
      location: "Austin, TX",
    });
  });

  it("parses date-first employment structure", () => {
    const parsed = parseResumeStructure(fixture("date-first.txt"));
    expect(parsed.experience[0]).toMatchObject({
      employer: "Signal Harbor",
      title: "Product Design Lead",
      startDate: "05/2022",
      endDate: "08/2024",
    });
  });

  it("groups wrapped and mixed responsibility lines without rewriting", () => {
    const parsed = parseResumeStructure(fixture("multiline-responsibilities.txt"));
    expect(parsed.experience[0].responsibilities).toEqual([
      "Designed an account-management workflow for enterprise teams while preserving the exact requirements supplied by operations.",
      "Conducted moderated usability sessions.",
    ]);
    expect(parsed.experience[0].sourceLines).toContain(
      "  while preserving the exact requirements supplied by operations.",
    );
  });

  it("finds employment without an explicit Experience heading", () => {
    const parsed = parseResumeStructure(fixture("no-experience-heading.txt"));
    expect(parsed.experience).toHaveLength(1);
    expect(parsed.experience[0].employer).toBe("Lakeview Systems");
  });

  it("does not classify projects before experience as employment", () => {
    const parsed = parseResumeStructure(fixture("projects-before-experience.txt"));
    expect(parsed.experience).toHaveLength(1);
    expect(parsed.experience[0]).toMatchObject({
      employer: "Juniper Ridge",
      title: "Product Designer",
    });
    expect(parsed.experience[0].sourceExcerpt).not.toContain("Community Directory");
  });

  it("does not create an empty placeholder when employment cannot be parsed", () => {
    const parsed = parseResumeStructure(fixture("no-employment-records.txt"));
    expect(parsed.experience).toEqual([]);
    expect(parsed.summary).toEqual([
      "Designer focused on clear, accessible digital experiences.",
    ]);
    expect(parsed.coreStrengths).toEqual(["Facilitation", "Prototyping"]);
  });

  it("flags a structurally valid role without dates for review", () => {
    const parsed = parseResumeStructure(
      "EXPERIENCE\n\nWillow Creek — Product Designer\n• Built verified prototypes.",
    );
    expect(parsed.experience[0]).toMatchObject({
      employer: "Willow Creek",
      title: "Product Designer",
      startDate: null,
      endDate: null,
      confidence: "Medium confidence",
      needsReview: true,
    });
  });

  it("handles PDF-style whitespace and excludes summary, strengths, and projects", () => {
    const parsed = parseResumeStructure(fixture("pdf-irregular-whitespace.txt"));
    expect(parsed.candidateName).toBe("Jordan Avery");
    expect(parsed.summary).toEqual([
      "Product designer working across complex product workflows.",
    ]);
    expect(parsed.coreStrengths).toEqual([
      "Research",
      "Design systems",
      "Cross-functional collaboration",
    ]);
    expect(parsed.experience).toHaveLength(2);
    expect(parsed.experience[0]).toMatchObject({
      employer: "Brightline Studio",
      title: "Principal Product Designer (Independent Product Development)",
      startDate: "Apr 2025",
      endDate: "Present",
    });
    expect(parsed.experience[1]).toMatchObject({
      employer: "Blue Oak Systems",
      title: "Senior Product Designer",
      startDate: "2021",
      endDate: "2024",
    });
    expect(parsed.experience.flatMap((item) => item.sourceLines).join("\n"))
      .not.toContain("Neighborhood Services Concept");
  });
});
