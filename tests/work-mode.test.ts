import { describe, expect, it } from "vitest";

import { DEFAULT_SCORING_CONFIG, scoreJob } from "../lib/scoring";
import {
  assessWorkMode,
  postingWorkMode,
  preferredWorkModes,
  remoteRestriction,
} from "../lib/work-mode";
import type { CategoryInput, ScoreCategory } from "../lib/types";

/** Every location string below is verbatim from the 429-job corpus. */

const PREFERENCE = "Remote or Hybrid";

describe("work mode stays out of the match score", () => {
  it("leaves locationFit unimplemented", () => {
    // DE-3L modelled activating it and rejected the result. The flag staying
    // put is the decision, so it is asserted rather than assumed.
    expect(DEFAULT_SCORING_CONFIG.locationFit.unimplemented).toBe(true);
  });

  it("scores the same role identically wherever it is listed", () => {
    /*
     * AlphaSense lists one Senior/Staff Product Designer role in New York, the
     * UK and Helsinki. The work is the same, so the match must be the same.
     * Scoring work mode gave those three listings different numbers, which is
     * what ruled the treatment out.
     */
    const inputs = (Object.keys(DEFAULT_SCORING_CONFIG) as ScoreCategory[]).map((category) => {
      const rating = { roleFit: 0.93, seniorityFit: 0.81, domainFit: 0.81, strategicScope: 1, handsOnDesign: 0.81 }[
        category as string
      ];
      return rating === undefined
        ? ({ category, reason: "", evidenceState: "missing" } as CategoryInput)
        : ({ category, rating, reason: "", evidenceState: "positive" } as CategoryInput);
    });
    const score = scoreJob(inputs).score;
    for (const location of [
      "New York, New York, United States; Remote - United States",
      "Remote - United Kingdom",
      "Helsinki, Uusimaa, Finland",
    ]) {
      // The assessment differs by location; the score does not depend on it.
      expect(assessWorkMode(location, null, PREFERENCE).postingMode).toBeDefined();
      expect(scoreJob(inputs).score, location).toBe(score);
    }
  });
});

describe("reading the posting's work mode", () => {
  it("reads the modes the location field states explicitly", () => {
    for (const [location, mode] of [
      ["Remote - USA", "remote"],
      ["San Francisco, Hybrid", "hybrid"],
      ["Union Square, New York City, OnSite", "onsite"],
      ["London - The River Building HQ, OnSite", "onsite"],
    ] as const) {
      expect(postingWorkMode(location, null).mode, location).toBe(mode);
    }
  });

  it("prefers hybrid when a posting says both", () => {
    // "Cardiff, London or Remote (UK)" alongside a hybrid arrangement.
    expect(postingWorkMode("Cardiff, London or Remote (UK), Hybrid", null).mode).toBe("hybrid");
  });

  it("treats a bare city as unknown, never as on-site", () => {
    // 310 of 429 postings name a place and say nothing about the arrangement.
    for (const location of ["San Francisco, CA", "Helsinki, Uusimaa, Finland", "EMEA", "Chicago, IL"]) {
      expect(postingWorkMode(location, null).mode, location).toBe("unknown");
    }
  });

  it("keeps the text it read the mode from", () => {
    expect(postingWorkMode("Munich, OnSite", null).evidence).toMatch(/onsite/i);
    expect(postingWorkMode("Berlin, Germany", null).evidence).toBeNull();
  });

  it("extracts where a remote role is restricted to", () => {
    for (const [location, restriction] of [
      ["Remote - USA", "USA"],
      ["Remote - United Kingdom", "United Kingdom"],
      ["United States - Remote", "United States - Remote"],
      ["Canada - Remote (ON, AB, BC, or NS Only)", "Canada - Remote"],
    ] as const) {
      expect(remoteRestriction(location), location).toContain(restriction.split(" ")[0]);
    }
    expect(remoteRestriction("San Francisco, CA")).toBeNull();
  });
});

describe("the declared preference", () => {
  it("reads the persisted value", () => {
    expect(preferredWorkModes("Remote or Hybrid")).toEqual(["remote", "hybrid"]);
    expect(preferredWorkModes("Remote")).toEqual(["remote"]);
    expect(preferredWorkModes("Hybrid")).toEqual(["hybrid"]);
  });

  it("draws no conclusion when nothing is declared", () => {
    expect(preferredWorkModes(null)).toEqual([]);
    expect(preferredWorkModes("")).toEqual([]);
    expect(assessWorkMode("Munich, OnSite", null, null).compatibility).toBe("NO_PREFERENCE");
  });
});

describe("compatibility verdicts", () => {
  it("clears a posting that matches the preference", () => {
    expect(assessWorkMode("Remote - USA", "Remote", PREFERENCE).compatibility).toBe("COMPATIBLE");
    expect(assessWorkMode("London, Hybrid", "Hybrid", PREFERENCE).compatibility).toBe("COMPATIBLE");
  });

  it("flags an on-site posting as a mismatch, not a bar", () => {
    // The preference model records what the candidate wants and offers no way
    // to say how firmly, so the wording never claims the role is impossible.
    const assessment = assessWorkMode("Munich, OnSite", "On-site", PREFERENCE);
    expect(assessment.compatibility).toBe("INCOMPATIBLE");
    expect(assessment.headline).toMatch(/you asked for/i);
    expect(assessment.headline).not.toMatch(/cannot|ineligible|blocked/i);
  });

  it("returns unknown, not a mismatch, when the posting is silent", () => {
    // The failure mode this whole phase exists to avoid.
    const assessment = assessWorkMode("Helsinki, Uusimaa, Finland", null, PREFERENCE);
    expect(assessment.compatibility).toBe("UNKNOWN");
    expect(assessment.compatibility).not.toBe("INCOMPATIBLE");
  });

  it("reports a geographic restriction without calling it incompatible", () => {
    // Whether "Remote - US" excludes this candidate is an eligibility
    // question, and eligibility refuses to infer from a location field.
    const assessment = assessWorkMode("Remote - USA", "Remote", PREFERENCE);
    expect(assessment.compatibility).toBe("COMPATIBLE");
    expect(assessment.geographicRestriction).toBe("USA");
    expect(assessment.headline).toMatch(/limited to USA/);
  });

  it("keeps work mode independent of the other dimensions", () => {
    // Captions: an on-site junior role. Work mode and level fit each report
    // their own finding; neither reaches into the other.
    const assessment = assessWorkMode("Union Square, New York City, OnSite", "On-site", PREFERENCE);
    expect(assessment.postingMode).toBe("onsite");
    expect(assessment.compatibility).toBe("INCOMPATIBLE");
  });
});
