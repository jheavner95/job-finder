import { describe, expect, it } from "vitest";

import {
  calculateCareerPerformance,
  type CpiApplication,
} from "../lib/career-performance";

const now = new Date("2026-07-27T12:00:00Z");

function application(
  id: number,
  overrides: Partial<CpiApplication> = {},
): CpiApplication {
  const appliedAt = new Date(`2026-07-${String(10 + id).padStart(2, "0")}T12:00:00Z`);
  return {
    id: String(id),
    status: "Applied",
    outcome: null,
    appliedAt,
    createdAt: appliedAt,
    updatedAt: appliedAt,
    sourceProvider: id % 2 ? "Lever" : "Greenhouse",
    industry: id % 2 ? "Cybersecurity" : "Healthcare",
    role: id % 2 ? "Staff Product Designer" : "Senior Product Designer",
    matchScore: 80 + id,
    timeline: [],
    interviews: [],
    documents: [],
    followUps: [],
    ...overrides,
  };
}

describe("career performance intelligence", () => {
  it("suppresses percentage analytics for empty and small datasets", () => {
    const empty = calculateCareerPerformance([], 5, now);
    expect(empty.overview.find((item) => item.label === "Interview rate")).toMatchObject({
      value: null,
      sufficient: false,
      sampleSize: 0,
    });
    const small = calculateCareerPerformance([
      application(1),
      application(2, { interviews: [{ type: "Video", round: "Recruiter screen", scheduledAt: now }] }),
    ], 5, now);
    expect(small.overview.find((item) => item.label === "Interview rate")?.value).toBeNull();
    expect(small.trends.sufficient).toBe(false);
  });

  it("calculates reproducible response, interview, offer, outcome, and follow-up metrics", () => {
    const records = Array.from({ length: 6 }, (_, index) => {
      const item = application(index + 1);
      const responded = index < 4;
      const interviewed = index < 3;
      const offered = index === 0;
      return {
        ...item,
        status: offered ? "Accepted" : index >= 4 ? "Closed" : "Applied",
        outcome: offered ? "Accepted" : index === 4 ? "No response" : index === 5 ? "Rejected" : null,
        updatedAt: new Date(item.appliedAt!.getTime() + 7 * 86_400_000),
        timeline: [
          ...(responded ? [{ type: "Recruiter contacted", eventAt: new Date(item.appliedAt!.getTime() + 2 * 86_400_000) }] : []),
          ...(offered ? [{ type: "Offer", eventAt: new Date(item.appliedAt!.getTime() + 6 * 86_400_000) }] : []),
        ],
        interviews: interviewed ? [{ type: "Video", round: "Recruiter screen", scheduledAt: now }] : [],
        followUps: [{ completedAt: index < 5 ? now : null }],
      } satisfies CpiApplication;
    });
    const result = calculateCareerPerformance(records, 5, now);
    expect(result.overview.find((item) => item.label === "Response rate")?.value).toBe(67);
    expect(result.overview.find((item) => item.label === "Interview rate")?.value).toBe(50);
    expect(result.overview.find((item) => item.label === "Offer rate")?.value).toBe(17);
    expect(result.overview.find((item) => item.label === "Average days to first response")?.value).toBeNull();
    expect(result.overview.find((item) => item.label === "Follow-up completion rate")?.value).toBe(83);
    expect(result.applicationMetrics.ghosted).toBe(1);
  });

  it("groups submitted document versions, providers, industries, and titles without ranking small samples", () => {
    const records = Array.from({ length: 7 }, (_, index) => application(index + 1, {
      documents: [
        { kind: "Resume", versionLabel: index < 6 ? "Resume v12" : "Resume v13", submittedAt: now },
        { kind: "Portfolio", versionLabel: "Enterprise Portfolio", submittedAt: now },
      ],
      interviews: index < 3 ? [{ type: "Video", round: "Portfolio review", scheduledAt: now }] : [],
      timeline: index === 0 ? [{ type: "Offer", eventAt: now }] : [],
    }));
    const result = calculateCareerPerformance(records, 5, now);
    expect(result.documents.find((item) => item.label === "Resume · Resume v12")).toMatchObject({
      applications: 6,
      sufficient: true,
      interviewRate: 50,
    });
    expect(result.documents.find((item) => item.label === "Resume · Resume v13")).toMatchObject({
      applications: 1,
      sufficient: false,
      interviewRate: null,
    });
    expect(result.providers.every((item) => !item.sufficient)).toBe(true);
    expect(result.industries.map((item) => item.label).sort()).toEqual(["Cybersecurity", "Healthcare"]);
    expect(result.titles.map((item) => item.label).sort()).toEqual(["Senior Product Designer", "Staff Product Designer"]);
  });

  it("excludes incomplete preparations from submitted-rate denominators", () => {
    const result = calculateCareerPerformance([
      application(1),
      application(2, { status: "Preparing", appliedAt: null }),
    ], 1, now);
    expect(result.totalApplications).toBe(2);
    expect(result.submitted).toBe(1);
    expect(result.overview.find((item) => item.label === "Applications submitted")?.value).toBe(1);
  });

  it("shows factual 90-day trends only when both periods meet the threshold", () => {
    const current = Array.from({ length: 5 }, (_, index) => application(index + 1, {
      appliedAt: new Date(`2026-06-${String(10 + index).padStart(2, "0")}T12:00:00Z`),
      interviews: [{ type: "Video", round: "Recruiter screen", scheduledAt: now }],
    }));
    const previous = Array.from({ length: 5 }, (_, index) => application(index + 11, {
      appliedAt: new Date(`2026-03-${String(10 + index).padStart(2, "0")}T12:00:00Z`),
      interviews: index < 2 ? [{ type: "Video", round: "Recruiter screen", scheduledAt: now }] : [],
    }));
    const result = calculateCareerPerformance([...current, ...previous], 5, now);
    expect(result.overview.find((item) => item.label === "Applications submitted")?.trend).toBe(0);
    expect(result.overview.find((item) => item.label === "Interview rate")?.trend).toBe(60);
  });
});
