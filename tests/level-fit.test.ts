import { describe, expect, it } from "vitest";

import {
  assessLevelFit,
  buildCandidateLevelProfile,
  currentRoleLevel,
  extractPostingLevel,
  levelsFromTitle,
  targetBand,
  yearsFromPosting,
  type CandidateLevelProfile,
} from "../lib/level-fit";

/** Titles and posting text below are verbatim from the 428-job corpus. */

const NOW = new Date("2026-08-09T00:00:00Z");

/** The persisted profile: 15 years, senior–principal target, currently Principal. */
function profile(overrides: Partial<CandidateLevelProfile> = {}): CandidateLevelProfile {
  return {
    ...buildCandidateLevelProfile({
      yearsExperience: 15,
      preferredRoles: [
        "Lead Product Designer",
        "Senior Product Desginer",
        "Principle Product Designer",
        "Product Designer",
      ],
      resumeRoles: [
        { title: "Principal Product Designer (Independent Product Development)", startDate: "Apr 2025", endDate: "Present" },
        { title: "Product Designer (Contract)", startDate: "Sep 2025", endDate: "Jul 2026" },
        { title: "Senior Product Designer (Contract)", startDate: "Feb 2024", endDate: "Aug 2025" },
      ],
      trackPreference: null,
    }),
    ...overrides,
  };
}

function assess(title: string, description = "", requirements: string[] = []) {
  return assessLevelFit(extractPostingLevel({ title, description, requirements }), profile(), NOW);
}

describe("candidate level profile, from persisted data only", () => {
  it("reads the target band from stated role preferences", () => {
    const band = targetBand(profile());
    expect(band).toEqual({ min: "senior", max: "principal" });
  });

  it("tolerates the spelling actually stored in the profile", () => {
    // "Principle Product Designer" is how the preference is persisted.
    expect(profile().targetLevels).toContain("principal");
  });

  it("never reads that tolerance into a posting", () => {
    // "design principles" appears in a large share of job descriptions.
    const posting = extractPostingLevel({
      title: "Product Designer",
      description: "You bring strong design principles and a principled approach to craft.",
      requirements: [],
    });
    expect(posting.level).not.toBe("principal");
  });

  it("takes the current level from the role marked Present, not the latest start date", () => {
    // An overlapping contract starting later is not a promotion.
    expect(profile().currentLevel).toBe("principal");
  });

  it("returns unknown rather than guessing when no title carries a level", () => {
    expect(currentRoleLevel([{ title: "Product Designer", startDate: "Jan 2020", endDate: "Present" }]).level)
      .toBe("unknown");
  });

  it("draws no track conclusion when none is declared", () => {
    expect(profile().trackPreference).toBeNull();
  });
});

describe("title level extraction", () => {
  it("reads a plain ladder title", () => {
    for (const [title, level] of [
      ["Junior Product Designer", "junior"],
      ["Senior Product Designer", "senior"],
      ["Sr. Product Designer - Data Management", "senior"],
      ["Staff Product Designer", "staff"],
      ["Principal Product Designer", "principal"],
      ["Design Lead", "lead"],
      ["Director, Product Design", "director"],
      ["Head of Design", "head"],
      ["VP, Design & User Experience", "executive"],
    ] as const) {
      expect(extractPostingLevel({ title, description: "", requirements: [] }).level, title).toBe(level);
    }
  });

  it("keeps both ends of a range title and judges by the higher", () => {
    const posting = extractPostingLevel({ title: "Senior / Staff Product Designer", description: "", requirements: [] });
    expect(posting.titleLevels).toEqual(["staff", "senior"]);
    expect(posting.level).toBe("staff");
  });

  it("handles the other range forms in the corpus", () => {
    for (const [title, level] of [
      ["Staff/Principal Product Designer", "principal"],
      ["Staff/Senior Product Designer, Mobile", "staff"],
      ["Senior Staff Product Designer, Risk", "staff"],
      ["Product Designer, AI-Native Products (Senior/Staff-Level)", "staff"],
      ["Product Designer (Principal-Level)", "principal"],
      ["Senior Lead - Computational Designer", "lead"],
    ] as const) {
      expect(extractPostingLevel({ title, description: "", requirements: [] }).level, title).toBe(level);
    }
  });

  it("does not read Associate Director as a junior role", () => {
    // The single worst misread available: the first word is a junior token.
    for (const title of [
      "Associate Design Director (AI & Tech)",
      "Associate Director Experience Design",
      "Associate Director Experience Design (d/f/m)",
    ]) {
      const posting = extractPostingLevel({ title, description: "", requirements: [] });
      expect(posting.level, title).toBe("director");
      expect(posting.titleLevels, title).not.toContain("junior");
    }
  });

  it("does not read a school name as a career stage", () => {
    // "Middle & High School Program Designer" is in the corpus.
    const posting = extractPostingLevel({
      title: "Middle & High School Program Designer (California)",
      description: "",
      requirements: [],
    });
    expect(posting.titleLevels).toEqual([]);
    expect(extractPostingLevel({ title: "Midweight UX/UI Designer", description: "", requirements: [] }).level)
      .toBe("mid");
  });

  it("never lets body text override an explicit title", () => {
    const posting = extractPostingLevel({
      title: "Junior Product Designer",
      description: "You will work alongside our staff and principal designers and a director of design.",
      requirements: [],
    });
    expect(posting.level).toBe("junior");
  });

  it("falls back to the body only when the title is silent", () => {
    expect(levelsFromTitle("Product Designer, Internal Experiences").levels).toEqual([]);
    const posting = extractPostingLevel({
      title: "Product Designer, Internal Experiences",
      description: "We are looking for someone with 3+ years of product design experience.",
      requirements: [],
    });
    expect(posting.level).toBe("mid");
  });
});

describe("years of experience", () => {
  it("takes the highest stated minimum, not the lowest", () => {
    // Oscar asks for "4+ years of product design" and "2+ years" of a narrower
    // skill. Reading the smaller number made a mid-level role look junior.
    const years = yearsFromPosting(
      "4+ years of product design experience. 2+ years of experience working with design systems.",
    );
    expect(years.min).toBe(4);
  });

  it("reads ranges without double-counting their halves", () => {
    const years = yearsFromPosting("0–2 years of design experience is required.");
    expect(years.min).toBe(0);
    expect(years.max).toBe(2);
    expect(years.evidence).toHaveLength(1);
  });

  it("ignores numbers that are not about the applicant's experience", () => {
    expect(yearsFromPosting("We shipped this 5 years ago and have a 3 year roadmap.").min).toBeNull();
  });

  it("is corroboration, not the model", () => {
    // 15 years does not qualify the candidate to run a design organisation.
    const head = assess("Head of Design", "We want 5+ years of experience.");
    expect(head.verdict).toBe("TOO_SENIOR");
  });
});

describe("track is separate from level", () => {
  it("does not treat Lead as management on the strength of the word alone", () => {
    for (const title of ["Lead Product Designer", "Design Lead", "Product Design Lead", "Service Design Lead"]) {
      expect(extractPostingLevel({ title, description: "", requirements: [] }).track, title).toBe("unknown");
    }
  });

  it("does not treat mentorship as management", () => {
    // Staff and Principal ICs mentor; that is the rung, not a reporting line.
    const posting = extractPostingLevel({
      title: "Staff Product Designer",
      description: "You will mentor junior designers and coach the team on craft.",
      requirements: [],
    });
    expect(posting.track).toBe("individual-contributor");
  });

  it("does not treat a Director as an executive", () => {
    const posting = extractPostingLevel({
      title: "Director, Product Design",
      description: "You will shape the design organization and partner with the executive team.",
      requirements: [],
    });
    expect(posting.level).toBe("director");
    expect(posting.track).toBe("people-management");
  });

  it("reads a denial of management duties as IC evidence", () => {
    // hellofresh: "It does not include people management responsibilities."
    const posting = extractPostingLevel({
      title: "Senior UX Designer, Consumer UX",
      description:
        "This role helps establish processes across the team and organization. It does not include people management responsibilities.",
      requirements: [],
    });
    expect(posting.track).toBe("individual-contributor");
  });

  it("does not read a perk as a duty", () => {
    // Jobgether lists performance reviews as a career-development benefit.
    const posting = extractPostingLevel({
      title: "Senior Design System Designer",
      description:
        "Clear career development opportunities through performance reviews, mentoring programs, and professional growth initiatives.",
      requirements: [],
    });
    expect(posting.track).toBe("individual-contributor");
  });

  it("does not read company marketing as a duty", () => {
    // Figma: "Figma is growing our team of passionate creatives and builders."
    const posting = extractPostingLevel({
      title: "Product Designer - Figma Weave",
      description: "Figma is growing our team of passionate creatives and builders.",
      requirements: [],
    });
    expect(posting.track).not.toBe("people-management");
    // With a level token present the same body settles on IC, confirming the
    // marketing line contributes nothing either way.
    expect(
      extractPostingLevel({
        title: "Senior Product Designer",
        description: "Figma is growing our team of passionate creatives and builders.",
        requirements: [],
      }).track,
    ).toBe("individual-contributor");
  });

  it("recognises real reporting-line evidence", () => {
    const posting = extractPostingLevel({
      title: "Design Director",
      description: "You will have four direct reports and conduct performance reviews each cycle.",
      requirements: [],
    });
    expect(posting.track).toBe("people-management");
  });

  it("recognises a player-coach", () => {
    const posting = extractPostingLevel({
      title: "Head of Product Design",
      description: "This is a player-coach role: you will hire, grow the design team, and stay hands-on.",
      requirements: [],
    });
    expect(posting.track).toBe("player-coach");
  });
});

describe("level fit verdicts", () => {
  it("marks a junior posting too junior however well it scores", () => {
    // Clera's Junior Product Designer scores 77 / Strong Fit on the legacy
    // model. Level fit is what the score structurally cannot say.
    expect(assess("Junior Product Designer", "0–2 years of design experience.").verdict).toBe("TOO_JUNIOR");
  });

  it("marks a principal posting ideal however poorly it scores", () => {
    // Linear's Principal Product Designer scores 55 / Stretch.
    expect(assess("Principal Product Designer", "7+ years of design experience.").verdict).toBe("IDEAL");
  });

  it("treats too junior and too senior as symmetric misses", () => {
    expect(assess("Junior Designer").verdict).toBe("TOO_JUNIOR");
    expect(assess("Head of Design").verdict).toBe("TOO_SENIOR");
    expect(assess("VP, Design & User Experience").verdict).toBe("TOO_SENIOR");
  });

  it("calls one rung above the band a stretch, not a mismatch", () => {
    expect(assess("Director, Product Design").verdict).toBe("STRETCH");
  });

  it("separates in-band-but-below-current from ideal", () => {
    expect(assess("Senior Product Designer").verdict).toBe("COMPATIBLE");
    expect(assess("Staff Product Designer").verdict).toBe("IDEAL");
  });

  it("does not rank a management role above an IC role", () => {
    const manager = assess("Product Design Manager", "You will manage a team of five designers.");
    const staff = assess("Staff Product Designer");
    expect(manager.verdict).toBe("IDEAL");
    expect(staff.verdict).toBe("IDEAL");
  });

  it("returns unknown when the posting states no level", () => {
    expect(assess("Product Designer, Internal Tools").verdict).toBe("UNKNOWN");
  });

  it("returns unknown when the profile carries no target band", () => {
    const blank = buildCandidateLevelProfile({
      yearsExperience: null,
      preferredRoles: [],
      resumeRoles: [],
      trackPreference: null,
    });
    const posting = extractPostingLevel({ title: "Staff Product Designer", description: "", requirements: [] });
    expect(assessLevelFit(posting, blank, NOW).verdict).toBe("UNKNOWN");
  });
});

describe("track mismatch requires a declared preference", () => {
  const managementPosting = extractPostingLevel({
    title: "Product Design Manager",
    description: "You will manage a team of six and conduct performance reviews.",
    requirements: [],
  });

  it("draws no mismatch when the candidate has not said", () => {
    expect(assessLevelFit(managementPosting, profile(), NOW).verdict).not.toBe("TRACK_MISMATCH");
  });

  it("draws one once an IC preference is declared", () => {
    const ic = profile({ trackPreference: "individual-contributor" });
    expect(assessLevelFit(managementPosting, ic, NOW).verdict).toBe("TRACK_MISMATCH");
  });

  it("treats a player-coach role as satisfying either intent", () => {
    const posting = extractPostingLevel({
      title: "Lead Product Designer",
      description: "A player-coach role.",
      requirements: [],
    });
    expect(assessLevelFit(posting, profile({ trackPreference: "individual-contributor" }), NOW).verdict)
      .not.toBe("TRACK_MISMATCH");
  });

  it("reports a clear level miss as a level miss even when the track also differs", () => {
    const head = extractPostingLevel({
      title: "Head of Design",
      description: "You will manage a team of twelve.",
      requirements: [],
    });
    expect(assessLevelFit(head, profile({ trackPreference: "individual-contributor" }), NOW).verdict)
      .toBe("TOO_SENIOR");
  });
});

describe("postings that disagree with themselves", () => {
  it("flags a disagreement that changes the answer", () => {
    // "Senior Designer" asking for 2+ years: in-band by title, out by years.
    const posting = extractPostingLevel({
      title: "21GRAMS- Senior Designer",
      description: "2+ years of design experience required.",
      requirements: [],
    });
    expect(assessLevelFit(posting, profile(), NOW).verdict).toBe("REVIEW_REQUIRED");
  });

  it("stays quiet when both readings land inside the band", () => {
    // A Principal title quoting 7+ years is ordinary title variance.
    expect(assess("Principal Product Designer", "7+ years of design experience.").verdict).toBe("IDEAL");
  });
});

describe("level fit is independent of eligibility", () => {
  it("judges the Kuwaiti-national posting on level alone", () => {
    // DE-3E puts this at eligibility REVIEW_REQUIRED/INELIGIBLE. Neither
    // dimension may reach into the other.
    const posting = extractPostingLevel({
      title: "Junior Designer - Kuwaiti National Only",
      description: "PLEASE NOTE WE CAN ONLY ACCEPT APPLICATIONS FROM KUWAITI NATIONALS FOR THIS ROLE.",
      requirements: [],
    });
    const verdict = assessLevelFit(posting, profile(), NOW);
    expect(verdict.verdict).toBe("TOO_JUNIOR");
    expect(posting.level).toBe("junior");
  });
});
