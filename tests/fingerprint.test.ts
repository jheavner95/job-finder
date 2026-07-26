import { describe, expect, it } from "vitest";
import { createJobFingerprint } from "../lib/fingerprint";

describe("createJobFingerprint", () => {
  it("normalizes superficial title and company variations", () => {
    const first = createJobFingerprint({
      company: "Northstar Ledger, Inc.",
      title: "Sr. Product Designer",
      location: "Chicago, IL",
    });
    const second = createJobFingerprint({
      company: "northstar ledger",
      title: "Senior Product Designer",
      location: "Chicago IL",
    });
    expect(first).toBe(second);
  });

  it("stays stable for the same source record", () => {
    const input = {
      company: "CivicGrid LLC",
      title: "Principal Product Designer",
      location: "Remote",
      sourceJobId: "CG-204",
    };
    expect(createJobFingerprint(input)).toBe(createJobFingerprint(input));
  });

  it("distinguishes materially different roles", () => {
    const principal = createJobFingerprint({
      company: "CivicGrid",
      title: "Principal Product Designer",
      location: "Remote",
    });
    const junior = createJobFingerprint({
      company: "CivicGrid",
      title: "Product Designer II",
      location: "Remote",
    });
    expect(principal).not.toBe(junior);
  });

  it("normalizes capitalization and harmless whitespace", () => {
    expect(createJobFingerprint({
      company: "  NORTHSTAR   LEDGER ",
      title: " STAFF PRODUCT DESIGNER ",
      location: " Remote ",
    })).toBe(createJobFingerprint({
      company: "northstar ledger",
      title: "staff product designer",
      location: "remote",
    }));
  });

  it("normalizes equivalent US remote wording", () => {
    expect(createJobFingerprint({
      company: "Vector Runtime",
      title: "Senior Product Designer",
      location: "Remote — United States",
    })).toBe(createJobFingerprint({
      company: "Vector Runtime",
      title: "Senior Product Designer",
      location: "US Remote",
    }));
  });

  it("distinguishes a different company", () => {
    const base = { title: "Staff Product Designer", location: "Remote" };
    expect(createJobFingerprint({ ...base, company: "Northstar Ledger" }))
      .not.toBe(createJobFingerprint({ ...base, company: "CivicGrid" }));
  });

  it("distinguishes a different source identifier", () => {
    const base = { company: "Northstar Ledger", title: "Staff Product Designer", location: "Remote" };
    expect(createJobFingerprint({ ...base, sourceJobId: "NL-100" }))
      .not.toBe(createJobFingerprint({ ...base, sourceJobId: "NL-101" }));
  });
});
