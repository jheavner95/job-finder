import { describe, expect, it } from "vitest";

import { loadProfile } from "../lib/profile";

/**
 * A stand-in for the two reads `loadProfile` performs, plus the two services it
 * delegates to. Everything here is data the real corpus contains, so the
 * assertions describe the product rather than a fixture.
 */
function database(over: {
  preferences?: Record<string, unknown> | null;
  evidence?: { category: string; label: string; confidence: string }[];
  portfolio?: { evidenceStatus: string }[];
  resumeEvidence?: number;
  yearsExperience?: number | null;
  eligibilityFacts?: unknown;
} = {}) {
  const profile = {
    displayName: "Jonathan Heavner",
    headline: "Senior product designer",
    yearsExperience: over.yearsExperience === undefined ? 15 : over.yearsExperience,
    eligibilityFacts: over.eligibilityFacts ?? null,
    careerPreferences:
      over.preferences === undefined
        ? {
            preferredRoles: ["Lead Product Designer", "Product Designer"],
            preferredIndustries: ["Enterprise Software", "AI Products"],
            workMode: "Remote or Hybrid",
            compensation: "$100k - $300k",
            employmentTypes: ["Full time"],
            companyExclusions: [],
            trackPreference: null,
          }
        : over.preferences,
    evidence: over.evidence ?? [
      { category: "skill", label: "Design systems", confidence: "confirmed" },
      { category: "skill", label: "Systems thinking", confidence: "confirmed" },
      { category: "industry", label: "FinTech", confidence: "high-level" },
    ],
    portfolio: over.portfolio ?? [{ evidenceStatus: "high-level-context-only" }],
    resumeEvidence: Array.from({ length: over.resumeEvidence ?? 12 }, () => ({ id: "x" })),
  };
  return {
    candidateProfile: {
      // Three callers share this client and each asks for a different shape.
      findFirst: async (args: { select?: Record<string, unknown> }) => {
        if (args?.select?.eligibilityFacts) {
          return { eligibilityFacts: profile.eligibilityFacts };
        }
        if (args?.select) {
          return {
            yearsExperience: profile.yearsExperience,
            careerPreferences: profile.careerPreferences
              ? {
                  preferredRoles: profile.careerPreferences.preferredRoles,
                  trackPreference: profile.careerPreferences.trackPreference,
                }
              : null,
            resumeEvidence: [],
          };
        }
        return profile;
      },
    },
  } as never;
}

describe("the profile separates what you said from what Job Finder worked out", () => {
  it("marks the target level as derived, because nothing stores it", () => {
    /*
     * There is no persisted target-level field. The band is read from the role
     * titles in career preferences, so presenting it as a declared fact would
     * send the user looking for a control that does not exist.
     */
    return loadProfile(database()).then((profile) => {
      expect(profile.targets.level.source).toBe("derived");
      expect(profile.targets.level.from).toMatch(/roles you listed/i);
    });
  });

  it("marks the current level as derived from the résumé", async () => {
    const profile = await loadProfile(database());
    expect(profile.targets.currentLevel.source).toBe("derived");
  });

  it("treats track and years as declared, because the user gave them", async () => {
    const profile = await loadProfile(database());
    expect(profile.targets.track.source).toBe("declared");
    expect(profile.targets.years.source).toBe("declared");
    expect(profile.targets.years.value).toBe("15 years");
  });

  it("says nothing rather than guessing when a preference is unset", async () => {
    const profile = await loadProfile(database());
    // trackPreference is null in the corpus and must stay null: fifteen years
    // of experience is not an appetite for managing people.
    expect(profile.targets.track.value).toBeNull();
  });
});

describe("evidence is reported at the strength the source supports", () => {
  it("separates confirmed claims from passing mentions", async () => {
    const profile = await loadProfile(database());
    const skills = profile.evidence.areas.find((area) => area.category === "Strengths");
    const industries = profile.evidence.areas.find((area) => area.category === "Industries");
    expect(skills?.confirmed).toBe(2);
    expect(industries?.confirmed).toBe(0);
    expect(industries?.partial).toBe(1);
  });

  it("counts portfolio projects that are only mentions as exactly that", async () => {
    const profile = await loadProfile(
      database({
        portfolio: [
          { evidenceStatus: "high-level-context-only" },
          { evidenceStatus: "high-level-context-only" },
        ],
      }),
    );
    expect(profile.evidence.portfolioProjects).toBe(2);
    expect(profile.evidence.portfolioDetailed).toBe(0);
  });

  it("invents no claim when there is no evidence", async () => {
    const profile = await loadProfile(database({ evidence: [], portfolio: [], resumeEvidence: 0 }));
    expect(profile.evidence.areas).toEqual([]);
    expect(profile.evidence.resumeRecords).toBe(0);
  });
});

describe("what to improve replaces a completion percentage", () => {
  it("raises only gaps that change a recommendation, and says what changes", async () => {
    const profile = await loadProfile(database());
    for (const gap of profile.gaps) {
      expect(gap.effect.length).toBeGreaterThan(0);
      expect(gap.label).toMatch(/^(Add|Say)/);
    }
    // Work authorization is undeclared in the corpus, and it genuinely holds
    // postings back for manual review.
    const eligibility = profile.gaps.find((gap) => gap.id === "eligibility");
    expect(eligibility?.material).toBe(true);
  });

  it("treats an unstated track as worth mentioning but not urgent", async () => {
    const profile = await loadProfile(database());
    expect(profile.gaps.find((gap) => gap.id === "track")?.material).toBe(false);
  });

  it("goes quiet when nothing is missing", async () => {
    const profile = await loadProfile(
      database({
        preferences: {
          preferredRoles: ["Staff Product Designer"],
          preferredIndustries: ["SaaS"],
          workMode: "Remote",
          compensation: "$200k",
          employmentTypes: ["Full time"],
          companyExclusions: [],
          trackPreference: "individual-contributor",
        },
        portfolio: [{ evidenceStatus: "detailed" }],
        eligibilityFacts: { version: 1, authorizedCountries: ["US"], declarationComplete: true },
      }),
    );
    // No meter stuck below 100%: an absent list is the finished state.
    expect(profile.gaps).toEqual([]);
  });

  it("asks for target roles first when there are none", async () => {
    const profile = await loadProfile(
      database({
        preferences: {
          preferredRoles: [],
          preferredIndustries: [],
          workMode: null,
          compensation: null,
          employmentTypes: [],
          companyExclusions: [],
          trackPreference: null,
        },
      }),
    );
    expect(profile.gaps[0].id).toBe("roles");
    expect(profile.gaps[0].material).toBe(true);
  });
});

describe("preferences the profile now owns", () => {
  it("carries every field that used to be editable only in onboarding", async () => {
    const profile = await loadProfile(database());
    expect(profile.targets.roles).toHaveLength(2);
    expect(profile.targets.industries).toContain("AI Products");
    expect(profile.work.mode).toBe("Remote or Hybrid");
    expect(profile.work.compensation).toBe("$100k - $300k");
    expect(profile.work.employmentTypes).toEqual(["Full time"]);
  });

  it("expresses AI product affinity through the existing industries field", async () => {
    /*
     * No new toggle: "AI Products" is already a stored industry and the domain
     * model reads it. What the corpus cannot yet do is hold *evidence* of AI
     * work — that gap is real and is not papered over here.
     */
    const profile = await loadProfile(database());
    expect(profile.targets.industries).toContain("AI Products");
    expect(profile.evidence.areas.flatMap((area) => area.labels)).not.toContain("AI Products");
  });
});
