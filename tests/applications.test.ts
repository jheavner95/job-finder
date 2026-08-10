import { describe, expect, it } from "vitest";

import {
  ACTIVE_STATES,
  STALE_AFTER_DAYS,
  buildApplications,
  deriveApplication,
  sinceLabel,
} from "../lib/applications";
import type { JobStatus } from "../lib/types";
import type { JobListItem } from "../lib/view-models";

const NOW = new Date("2026-08-10T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

type Decision = { status: JobStatus; at: string; note?: string | null };

function job(decisions: Decision[], over: Partial<JobListItem> = {}) {
  return {
    id: `job-${decisions.length}-${Math.random().toString(36).slice(2, 8)}`,
    title: "Staff Product Designer",
    company: "Instrumentl",
    companyInitials: "IN",
    location: "Remote - USA",
    remoteStatus: "Remote",
    employmentType: "Full-time",
    compensation: "Not listed",
    posted: "Aug 1, 2026",
    source: "Lever",
    sourceUrl: "https://example.test",
    verification: {
      label: "Verified Today",
      tone: "verified" as const,
      importedAt: daysAgo(20),
      lastVerifiedAt: daysAgo(1),
      importAge: "20 days ago",
      officialAts: "Lever",
    },
    // Newest first, as the query layer returns them.
    decisions: [...decisions]
      .sort((left, right) => right.at.localeCompare(left.at))
      .map((decision) => ({ ...decision, note: decision.note ?? null })),
    status: decisions[0]?.status ?? ("New" as JobStatus),
    score: 87,
    confidence: 70,
    eligibility: "eligible" as const,
    eligibilityAssessment: null,
    levelFit: null,
    workMode: null,
    evidenceCoverage: { coverage: 1, sufficient: true },
    summary: "",
    matchReason: "",
    concerns: [],
    isSynthetic: false,
    ...over,
  } as JobListItem;
}

describe("an application is a decision history, not a second record", () => {
  it("derives nothing from an opportunity that was never applied to", () => {
    expect(deriveApplication(job([]), NOW)).toBeNull();
    expect(deriveApplication(job([{ status: "Saved", at: daysAgo(3) }]), NOW)).toBeNull();
  });

  it("surfaces an applied decision with no Application row behind it", () => {
    /*
     * The whole defect: four APPLIED decisions existed and Applications read an
     * empty table, so the product denied work the user had recorded.
     */
    const application = deriveApplication(job([{ status: "Applied", at: daysAgo(14) }]), NOW);
    expect(application).not.toBeNull();
    expect(application?.state).toBe("applied");
    expect(application?.active).toBe(true);
  });

  it("reads the applied date from the decision rather than inventing one", () => {
    const application = deriveApplication(job([{ status: "Applied", at: daysAgo(14) }]), NOW);
    expect(application?.appliedAt).toBe(daysAgo(14));
  });

  it("keeps the original applied date when the application moves on", () => {
    // Re-recording a decision must not rewrite the day you applied.
    const application = deriveApplication(
      job([
        { status: "Applied", at: daysAgo(30) },
        { status: "Interviewing", at: daysAgo(2) },
      ]),
      NOW,
    );
    expect(application?.appliedAt).toBe(daysAgo(30));
    expect(application?.lastActivityAt).toBe(daysAgo(2));
    expect(application?.state).toBe("interviewing");
  });
});

describe("the same decision means different things before and after applying", () => {
  it("treats a rejection before applying as passing on the opportunity", () => {
    // No application exists, so there is nothing for Applications to show.
    expect(deriveApplication(job([{ status: "Rejected", at: daysAgo(5) }]), NOW)).toBeNull();
  });

  it("treats a rejection after applying as the outcome", () => {
    const application = deriveApplication(
      job([
        { status: "Applied", at: daysAgo(20) },
        { status: "Rejected", at: daysAgo(1) },
      ]),
      NOW,
    );
    expect(application?.state).toBe("closed");
    expect(application?.outcome).toBe("Not selected");
    expect(application?.active).toBe(false);
  });

  it("ignores a pass recorded before the application began", () => {
    /*
     * Passed on it, changed your mind, applied anyway. The earlier rejection is
     * not the outcome of an application that did not exist yet.
     */
    const application = deriveApplication(
      job([
        { status: "Rejected", at: daysAgo(40) },
        { status: "Applied", at: daysAgo(10) },
      ]),
      NOW,
    );
    expect(application?.state).toBe("applied");
    expect(application?.outcome).toBeNull();
  });

  it("distinguishes a closed posting from a rejection", () => {
    const application = deriveApplication(
      job([
        { status: "Applied", at: daysAgo(20) },
        { status: "Closed", at: daysAgo(1) },
      ]),
      NOW,
    );
    expect(application?.outcome).toBe("No longer open");
  });
});

describe("states", () => {
  it("carries every state the decision vocabulary can express", () => {
    const cases: [JobStatus, string][] = [
      ["Applied", "applied"],
      ["Interviewing", "interviewing"],
      ["Offer", "offer"],
      ["Rejected", "closed"],
      ["Closed", "closed"],
    ];
    for (const [decision, expected] of cases) {
      const application = deriveApplication(
        job([{ status: "Applied", at: daysAgo(20) }, { status: decision, at: daysAgo(1) }]),
        NOW,
      );
      expect(application?.state).toBe(expected);
      expect(application?.active).toBe(ACTIVE_STATES.includes(expected as never));
    }
  });

  it("records the history in reverse order, newest first", () => {
    const application = deriveApplication(
      job([
        { status: "Applied", at: daysAgo(30) },
        { status: "Interviewing", at: daysAgo(10) },
        { status: "Offer", at: daysAgo(1) },
      ]),
      NOW,
    );
    expect(application?.history.map((event) => event.label)).toEqual([
      "Offer",
      "Interviewing",
      "Applied",
    ]);
  });
});

describe("the workspace", () => {
  const corpus = [
    job([{ status: "Applied", at: daysAgo(2) }]),
    job([{ status: "Applied", at: daysAgo(40) }]),
    job([{ status: "Applied", at: daysAgo(60) }, { status: "Interviewing", at: daysAgo(1) }]),
    job([{ status: "Applied", at: daysAgo(90) }, { status: "Rejected", at: daysAgo(30) }]),
    job([{ status: "Saved", at: daysAgo(1) }]),
    job([]),
  ];

  it("counts only what the user actually applied to", () => {
    const model = buildApplications(corpus, NOW);
    expect(model.all).toHaveLength(4);
    expect(model.active).toHaveLength(3);
    expect(model.closed).toHaveLength(1);
  });

  it("puts what moved most recently first", () => {
    const model = buildApplications(corpus, NOW);
    expect(model.all[0].state).toBe("interviewing");
  });

  it("raises only applications that have genuinely gone quiet", () => {
    // Silence is derived from the last recorded decision — no timer, no
    // scheduled reminder, and nothing stored to make it work.
    const model = buildApplications(corpus, NOW);
    expect(model.stale).toHaveLength(1);
    expect(model.stale[0].daysSinceActivity).toBeGreaterThanOrEqual(STALE_AFTER_DAYS);
  });

  it("produces nothing at all when nothing has been applied to", () => {
    const model = buildApplications([job([]), job([{ status: "Saved", at: daysAgo(1) }])], NOW);
    expect(model.all).toEqual([]);
    expect(model.stale).toEqual([]);
    // Every count is zero because there is nothing, not because a stage is empty.
    expect(Object.values(model.stateCounts).every((count) => count === 0)).toBe(true);
  });
});

describe("an application row states facts, not scores", () => {
  it("leaves fit out entirely", () => {
    /*
     * The tier decided whether to apply. Afterwards it is a number you can no
     * longer act on, and it would compete with the state that you can.
     */
    const application = deriveApplication(
      job([{ status: "Applied", at: daysAgo(3) }], { score: 87 }),
      NOW,
    );
    expect(JSON.stringify(application)).not.toContain("87");
  });

  it("omits absent metadata rather than announcing it", () => {
    const application = deriveApplication(
      job([{ status: "Applied", at: daysAgo(3) }], {
        location: "Location unavailable",
        compensation: "Not listed",
        workMode: null,
      }),
      NOW,
    );
    expect(application?.facts).toEqual([]);
  });

  it("keeps salary and work mode when the posting states them", () => {
    const application = deriveApplication(
      job([{ status: "Applied", at: daysAgo(3) }], {
        location: "Berlin, Germany",
        compensation: "$180,000–$220,000",
        workMode: { postingMode: "hybrid" } as never,
      }),
      NOW,
    );
    expect(application?.facts).toEqual(["Hybrid", "Berlin, Germany", "$180,000–$220,000"]);
  });
});

describe("elapsed time reads as a person would say it", () => {
  it("names the recent days and rounds the rest", () => {
    expect(sinceLabel(daysAgo(0), NOW)).toBe("today");
    expect(sinceLabel(daysAgo(1), NOW)).toBe("yesterday");
    expect(sinceLabel(daysAgo(14), NOW)).toBe("14 days ago");
    expect(sinceLabel(daysAgo(60), NOW)).toBe("2 months ago");
  });
});
