import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  deserializeOpportunityIntelligence,
} from "../lib/candidate-intelligence/service";
import { completeCandidateEvidence } from "../lib/candidate-intelligence/evidence-completion";
import { createTestDatabase, releaseTestDatabases } from "./test-database";

afterEach(releaseTestDatabases);

describe("candidate intelligence persistence", () => {
  it("structures Markdown evidence and persists explainable guidance for every imported job", async () => {
    const database = await createTestDatabase({ label: "candidate-intelligence" });

    // Explicit imported opportunities, so "every imported job" is exercised
    // rather than vacuously satisfied by an empty opportunity set.
    const suffix = randomUUID();
    const source = await database.jobSource.create({
      data: { name: `Evidence source ${suffix}` },
    });
    const company = await database.company.create({
      data: { name: `Evidence company ${suffix}` },
    });
    await Promise.all([
      "Staff Product Designer",
      "Principal Product Designer",
    ].map((title, index) => database.job.create({
      data: {
        fingerprint: `evidence-${suffix}-${index}`,
        sourceJobId: `evidence-${index}`,
        title,
        location: "Remote — United States",
        sourceUrl: `https://example.test/${suffix}/${index}`,
        originalSourceText:
          "Lead enterprise design systems, research operations, and accessibility work.",
        isSynthetic: false,
        companyId: company.id,
        sourceId: source.id,
      },
    })));

    const result = await completeCandidateEvidence(database);
    const imported = await database.job.count({ where: { isSynthetic: false } });
    expect(imported).toBe(2);
    expect(result.resumeRecords).toBeGreaterThanOrEqual(0);
    expect(result.portfolioProjects).toBeGreaterThanOrEqual(0);
    expect(result.capabilityLinks.resume).toBeGreaterThanOrEqual(0);
    expect(result.capabilityLinks.portfolio).toBeGreaterThanOrEqual(0);
    expect(result.intelligence).toMatchObject({
      jobs: imported,
      generated: imported,
    });

    const profile = await database.candidateProfile.findUniqueOrThrow({
      where: { id: "primary-candidate" },
      include: { evidence: true, portfolio: true },
    });
    expect(profile.displayName.length).toBeGreaterThan(0);
    expect(profile.headline.length).toBeGreaterThan(0);
    expect(profile.evidence.length).toBeGreaterThanOrEqual(0);
    expect(profile.portfolio).toHaveLength(result.portfolioProjects);
    expect(profile.portfolio.every((project) =>
      project.portfolioReadiness === 0
      && project.documentationCompleteness === 0
      && project.outcomeEvidenceReadiness === 0
      && project.confidence === 20,
    )).toBe(true);
    const readiness = await database.candidateResumeReadiness.findUniqueOrThrow({
      where: { profileId: "primary-candidate" },
    });
    expect(readiness).toMatchObject({
      capabilityCoverage: 0,
      industryCoverage: 0,
      domainCoverage: 0,
      leadershipCoverage: 0,
      portfolioSupport: 0,
    });

    const records = await database.opportunityIntelligence.findMany();
    expect(records).toHaveLength(imported);
    for (const record of records) {
      const intelligence = deserializeOpportunityIntelligence(record);
      expect(intelligence.version).toBe("candidate-evidence-v1");
      const recommendations = [
        ...intelligence.strengths,
        ...intelligence.missingEvidence,
        ...intelligence.concerns,
        ...intelligence.portfolioRecommendations,
        ...intelligence.resumeRecommendations,
        ...intelligence.interviewTopics,
        ...intelligence.preparationChecklist,
      ];
      expect(recommendations.every((item) =>
        item.evidence.length > 0
        && item.evidence.every((source) =>
          source.id && source.source && source.excerpt))).toBe(true);
    }
  });
});
