import { describe, expect, it } from "vitest";

import {
  buildImportScoringInputs,
  createJobImportPreview,
  jobImportSchema,
  normalizeJobImport,
  type JobImportInput,
} from "../lib/job-import";

const validInput: JobImportInput = {
  title: "Senior Product Designer",
  company: "Acme Platform",
  description: `You will own end-to-end product design strategy for an enterprise platform.
Requirements
- 8 years of experience with product design
- Create prototypes and maintain a design system
- Travel for quarterly on-site planning`,
  url: "https://example.com/jobs/123",
  source: "Company site",
  salary: "$180k–$220k",
  location: "Remote — United States",
  employmentType: "Full-time",
};

describe("manual job import", () => {
  it("rejects missing title, company, and description", () => {
    const result = jobImportSchema.safeParse({
      ...validInput,
      title: "",
      company: "",
      description: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        title: expect.any(Array),
        company: expect.any(Array),
        description: expect.any(Array),
      });
    }
  });

  it("keeps salary optional", () => {
    const result = jobImportSchema.safeParse({ ...validInput, salary: "" });
    expect(result.success).toBe(true);
  });

  it("preserves source text while producing normalized fields", () => {
    const normalized = normalizeJobImport(validInput);
    expect(validInput.description).toContain("- 8 years");
    expect(normalized.description).toContain("8 years");
    expect(normalized.requirements.length).toBeGreaterThan(0);
    expect(normalized.concerns).toContain("Travel for quarterly on-site planning");
    expect(normalized.remoteStatus).toBe("Remote");
  });

  it("generates a stable duplicate fingerprint independent of URL", () => {
    const first = normalizeJobImport(validInput);
    const second = normalizeJobImport({
      ...validInput,
      url: "https://another-source.example/role",
      company: "ACME PLATFORM, INC.",
      title: "Senior  Product Designer",
    });
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("runs the certified deterministic score and confidence engine", () => {
    const preview = createJobImportPreview(validInput);
    expect(preview.evaluation.score).toBeGreaterThan(0);
    expect(preview.evaluation.confidence).toBeGreaterThan(0);
    expect(preview.evaluation.confidence).toBeLessThan(100);
    expect(preview.evaluation.categories).toHaveLength(10);
    expect(preview.evaluation.summary).toContain("Confidence is");
  });

  it("marks unsupported comparison categories as missing evidence", () => {
    const inputs = buildImportScoringInputs(normalizeJobImport(validInput));
    for (const category of [
      "portfolioEvidence",
      "compensationFit",
      "locationFit",
      "companyPreference",
    ]) {
      expect(inputs.find((input) => input.category === category)?.evidenceState)
        .toBe("missing");
    }
  });

  it("is deterministic for repeated previews", () => {
    expect(createJobImportPreview(validInput))
      .toEqual(createJobImportPreview(validInput));
  });
});
