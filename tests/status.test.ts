import { describe, expect, it } from "vitest";
import { decisionInputSchema, jobStatusSchema } from "../lib/status";

describe("decision validation", () => {
  it("accepts every supported status", () => {
    const statuses = [
      "New",
      "Strong Match",
      "Possible",
      "Rejected",
      "Saved",
      "Applied",
      "Interviewing",
      "Offer",
      "Closed",
    ];
    expect(statuses.every((status) => jobStatusSchema.safeParse(status).success)).toBe(true);
  });

  it("rejects unsupported status values", () => {
    expect(jobStatusSchema.safeParse("Auto Applied").success).toBe(false);
  });

  it("validates identifiers and note length", () => {
    expect(decisionInputSchema.safeParse({
      jobId: "not-a-cuid",
      status: "Saved",
      note: "Valid note",
    }).success).toBe(false);
    expect(decisionInputSchema.safeParse({
      jobId: "cmryi0n3s0003tfuu4b80nevz",
      status: "Saved",
      note: "x".repeat(2001),
    }).success).toBe(false);
  });
});
