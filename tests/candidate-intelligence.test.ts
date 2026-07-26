import { describe, expect, it } from "vitest";

import { generateOpportunityIntelligence } from "../lib/candidate-intelligence/engine";

const evidence = [
  {
    id: "skill-enterprise",
    profileId: "primary-candidate",
    category: "skill",
    label: "Complex enterprise software",
    sourceDocument: "career-profile.md",
    sourceExcerpt: "Complex enterprise software",
    keywords: ["enterprise", "internal tools"],
    confidence: "confirmed",
    evidenceQuality: "Confirmed",
    projectName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "skill-design-systems",
    profileId: "primary-candidate",
    category: "skill",
    label: "Design systems",
    sourceDocument: "career-profile.md",
    sourceExcerpt: "Design systems",
    keywords: ["design systems"],
    confidence: "confirmed",
    evidenceQuality: "Confirmed",
    projectName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const portfolio = [
  {
    id: "portfolio-1",
    profileId: "primary-candidate",
    name: "Example Platform",
    evidenceStatus: "high-level-context-only",
    evidenceQuality: "Partial",
    portfolioReadiness: 50,
    sourceDocument: "portfolio-evidence.md",
    sourceExcerpt:
      "Example Platform is a confirmed project context; responsibilities and outcomes are not yet mapped.",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

describe("candidate intelligence", () => {
  const intelligence = generateOpportunityIntelligence({
    title: "Senior Product Designer",
    company: "Example",
    description:
      "Design enterprise internal tools and design systems for an AI platform. Lead cross-functional discovery.",
    requirements: ["Accessibility experience is preferred."],
    concerns: ["Quarterly travel is required."],
    confidence: 72,
  }, evidence, portfolio);

  it("creates deterministic strengths and a concise top match reason", () => {
    expect(intelligence.topReason).toBe("Strong complex enterprise software fit.");
    expect(intelligence.matchedSkills.map((item) => item.title)).toEqual([
      "Complex enterprise software",
      "Design systems",
    ]);
    expect(intelligence.confidenceExplanation).toContain(
      "does not alter the score or confidence",
    );
  });

  it("makes every recommendation traceable to candidate or job evidence", () => {
    const allGuidance = [
      ...intelligence.strengths,
      ...intelligence.missingEvidence,
      ...intelligence.concerns,
      ...intelligence.portfolioRecommendations,
      ...intelligence.resumeRecommendations,
      ...intelligence.interviewTopics,
      ...intelligence.preparationChecklist,
    ];
    expect(allGuidance.length).toBeGreaterThan(0);
    expect(allGuidance.every((item) => item.evidence.length > 0)).toBe(true);
    expect(allGuidance.flatMap((item) => item.evidence).every(
      (item) => item.source && item.excerpt,
    )).toBe(true);
  });

  it("labels unsupported requirements as missing instead of inventing expertise", () => {
    expect(intelligence.missingEvidence.map((item) => item.title))
      .toEqual(expect.arrayContaining(["Accessibility", "AI product experience"]));
    expect(intelligence.resumeRecommendations.some((item) =>
      item.title.includes("Do not add unsupported"))).toBe(true);
  });

  it("recommends known portfolio contexts without claiming unverified outcomes", () => {
    expect(intelligence.portfolioRecommendations[0]).toMatchObject({
      title: "Example Platform",
      status: "prepare",
    });
    expect(intelligence.portfolioRecommendations[0].explanation)
      .toContain("Confirm every unmapped responsibility and outcome");
  });
});
