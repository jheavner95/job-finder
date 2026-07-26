import { describe, expect, it } from "vitest";

import { calculatePortfolioReadiness } from "../lib/candidate-intelligence/readiness";
import { extractResumeEvidence } from "../lib/candidate-intelligence/resume-import";

describe("candidate evidence completion", () => {
  it("does not import the placeholder resume as employment evidence", () => {
    expect(extractResumeEvidence(
      "# Master resume\n**Current resume source: not supplied.**",
    )).toEqual([]);
  });

  it("extracts only explicitly supplied structured resume fields", () => {
    const records = extractResumeEvidence(`---
source_status: verified
---
## Experience
### Example Employer | Senior Product Designer
- Dates: 2020-01; 2024-06
- Responsibilities: Led workflow redesign; Built reusable interaction patterns
- Leadership: Mentored two designers
- Domains: Enterprise SaaS
- Industries: Insurance
- Products: Web application
- Technologies: Figma
- Methods: User interviews; Prototyping
- Collaboration: Product; Engineering
- Research: User interviews
- Accessibility: Unknown
- AI: Unknown
- Design systems: Component library
- Enterprise: Internal platform`);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      employer: "Example Employer",
      title: "Senior Product Designer",
      startDate: "2020-01",
      endDate: "2024-06",
      evidenceQuality: "Verified",
      accessibility: [],
      ai: [],
    });
    expect(records[0].responsibilities).toEqual([
      "Led workflow redesign",
      "Built reusable interaction patterns",
    ]);
  });

  it("keeps unmapped projects at zero readiness with partial source confidence", () => {
    expect(calculatePortfolioReadiness({
      evidenceQuality: "Partial",
    })).toEqual({
      documentationCompleteness: 0,
      visualEvidenceReadiness: 0,
      outcomeEvidenceReadiness: 0,
      interviewReadiness: 0,
      portfolioReadiness: 0,
      confidence: 20,
    });
  });

  it("calculates readiness solely from populated evidence fields", () => {
    const readiness = calculatePortfolioReadiness({
      employer: "Example",
      timeframe: "2024",
      role: "Product Designer",
      responsibilities: ["Owned research and interaction design"],
      problem: "Complex workflow",
      solution: "Redesigned workflow",
      businessOutcome: "Unknown",
      designOutcome: "Validated interaction model",
      researchPerformed: "User interviews",
      leadershipDemonstrated: "Unknown",
      crossFunctionalPartners: ["Product", "Engineering"],
      industry: "Insurance",
      productType: "SaaS",
      platform: "Web",
      enterpriseScale: "Enterprise",
      designSystemUsage: "Component library",
      accessibilityWork: "Unknown",
      aiUsage: "Unknown",
      artifactsAvailable: ["Case-study deck"],
      confidentiality: "Internal details restricted",
      evidenceQuality: "Verified",
    });
    expect(readiness.documentationCompleteness).toBeGreaterThan(60);
    expect(readiness.visualEvidenceReadiness).toBe(100);
    expect(readiness.outcomeEvidenceReadiness).toBe(50);
    expect(readiness.portfolioReadiness).toBeGreaterThan(50);
  });
});
