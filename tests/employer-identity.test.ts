import { describe, expect, it } from "vitest";

import {
  canonicalEmployerKey,
  canonicalEmployerName,
  EMPLOYER_ALIASES,
  isKnownAlias,
  sameEmployer,
} from "../lib/job-sources/employer-identity";

describe("recorded employer aliases", () => {
  it("resolves Addepar1 to the canonical Addepar", () => {
    expect(canonicalEmployerName("Addepar1")).toBe("Addepar");
    expect(canonicalEmployerName("Addepar")).toBe("Addepar");
    expect(sameEmployer("Addepar", "Addepar1")).toBe(true);
    expect(canonicalEmployerKey("Addepar1")).toBe(canonicalEmployerKey("Addepar"));
  });

  it("treats the alias as an alias and the canonical as canonical", () => {
    expect(isKnownAlias("Addepar1")).toBe(true);
    expect(isKnownAlias("Addepar")).toBe(false);
  });

  it("is case- and whitespace-insensitive for recorded names only", () => {
    expect(sameEmployer("  addepar1 ", "ADDEPAR")).toBe(true);
  });

  it("records evidence for every alias entry", () => {
    for (const entry of EMPLOYER_ALIASES) {
      expect(entry.canonical.trim().length, entry.canonical).toBeGreaterThan(0);
      expect(entry.aliases.length, entry.canonical).toBeGreaterThan(0);
      expect(entry.evidence.trim().length, entry.canonical).toBeGreaterThan(20);
    }
  });
});

describe("unrecorded names never merge", () => {
  // Each pair is a plausible near-miss. None is aliased, so none may collapse.
  const mustNotMerge: Array<[string, string]> = [
    ["Scale AI", "ScaleAI"],
    ["OpenAI", "Open AI"],
    ["Coinbase", "Coinbase Global"],
    ["Addepar", "Addepar2"],
    ["Addepar", "Addepar Inc"],
    ["Ramp", "Ramp Financial"],
    ["Linear", "Linear Labs"],
    ["Notion", "Notion Labs"],
    ["Vanta", "Vanta Security"],
    ["Plaid", "Plaid Inc"],
    ["Figma", "Figma1"],
    ["Brex", "Brex Treasury"],
  ];

  it.each(mustNotMerge)("keeps %s and %s distinct", (left, right) => {
    expect(sameEmployer(left, right)).toBe(false);
  });

  it("does not strip trailing digits as a general rule", () => {
    // Addepar1 -> Addepar is evidence, not a pattern. Nothing else follows it.
    expect(sameEmployer("Acme1", "Acme")).toBe(false);
    expect(sameEmployer("Figma1", "Figma")).toBe(false);
    expect(canonicalEmployerName("Acme1")).toBe("Acme1");
  });

  it("does not merge on shared prefixes or substrings", () => {
    expect(sameEmployer("Stripe", "Stripes")).toBe(false);
    expect(sameEmployer("Notion", "Notion")).toBe(true);
    expect(sameEmployer("Ramp", "Rampart")).toBe(false);
  });

  it("never reports two empty or blank names as the same employer", () => {
    expect(sameEmployer("", "")).toBe(false);
    expect(sameEmployer("   ", "")).toBe(false);
  });

  it("leaves unrecorded names untouched", () => {
    expect(canonicalEmployerName("Databricks")).toBe("Databricks");
    expect(canonicalEmployerName("Some New Employer")).toBe("Some New Employer");
  });
});
