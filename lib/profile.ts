import type { PrismaClient } from "@prisma/client";

import { loadCandidateFacts } from "./eligibility/service";
import { LEVEL_LABEL } from "./level-fit/ladder";
import { targetBand } from "./level-fit";
import { loadCandidateLevelProfile } from "./level-fit/service";
import type { CandidateEligibilityFacts } from "./eligibility/types";
import type { CandidateLevelProfile } from "./level-fit/types";

/**
 * Your Profile — what Job Finder knows about the person it is evaluating for.
 *
 * Candidate facts were spread across four routes. Target roles, industries,
 * work mode and compensation were editable *only* inside the onboarding wizard
 * at `/getting-started`, so changing a preference meant re-entering first-run
 * setup. Career level and authorization lived on `/context`, evidence on
 * `/evidence`, writing voice on `/context/writing-voice`.
 *
 * The distinction this model exists to keep straight: some of these facts the
 * user *told* Job Finder, and some Job Finder *worked out*. A profile that
 * blurs the two invites the user to "correct" something they never said, or to
 * trust a guess as though they had confirmed it.
 */

/** Where a fact came from. The UI must never present the second as the first. */
export type FactSource = "declared" | "derived";

export type ProfileFact = {
  label: string;
  value: string | null;
  source: FactSource;
  /** Plain-language note on where a derived value came from. */
  from?: string;
};

export type EvidenceArea = {
  category: string;
  labels: string[];
  /** Confirmed means a source document backs the claim directly. */
  confirmed: number;
  partial: number;
};

/** Something worth doing, in order. Replaces a single completion percentage. */
export type ProfileGap = {
  id: string;
  /** What to do, phrased as an action. */
  label: string;
  /** What it changes about the recommendations, in outcomes not mechanics. */
  effect: string;
  href: string;
  /** True when the gap actively degrades results rather than merely existing. */
  material: boolean;
};

export type ProfileModel = {
  name: string;
  headline: string;
  targets: {
    roles: string[];
    industries: string[];
    level: ProfileFact;
    currentLevel: ProfileFact;
    track: ProfileFact;
    years: ProfileFact;
  };
  work: {
    mode: string | null;
    employmentTypes: string[];
    compensation: string | null;
    exclusions: string[];
  };
  eligibility: {
    facts: CandidateEligibilityFacts | null;
    declared: boolean;
  };
  evidence: {
    areas: EvidenceArea[];
    /** Employment records imported from the résumé and approved. */
    resumeRecords: number;
    /** Portfolio projects, and how many carry more than a passing mention. */
    portfolioProjects: number;
    portfolioDetailed: number;
  };
  gaps: ProfileGap[];
  levelProfile: CandidateLevelProfile;
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** "skill" → "Strengths". Category keys are storage, not language. */
const AREA_LABEL: Record<string, string> = {
  skill: "Strengths",
  industry: "Industries",
  product: "Product types",
  domain: "Domains",
  experience: "Experience",
};

export async function loadProfile(database: PrismaClient): Promise<ProfileModel> {
  const [profile, levelProfile, eligibilityFacts] = await Promise.all([
    database.candidateProfile.findFirst({
      include: {
        careerPreferences: true,
        evidence: { select: { category: true, label: true, confidence: true } },
        portfolio: { select: { evidenceStatus: true } },
        resumeEvidence: { select: { id: true } },
      },
    }),
    loadCandidateLevelProfile(database),
    loadCandidateFacts(database),
  ]);

  const preferences = profile?.careerPreferences;
  const roles = strings(preferences?.preferredRoles);
  const industries = strings(preferences?.preferredIndustries);
  const band = targetBand(levelProfile);

  const byCategory = new Map<string, EvidenceArea>();
  for (const item of profile?.evidence ?? []) {
    const area = byCategory.get(item.category) ?? {
      category: AREA_LABEL[item.category] ?? item.category,
      labels: [],
      confirmed: 0,
      partial: 0,
    };
    area.labels.push(item.label);
    // "confirmed" is the only value that means a document states the claim
    // outright; everything else is context the résumé merely implies.
    if (item.confidence === "confirmed") area.confirmed += 1;
    else area.partial += 1;
    byCategory.set(item.category, area);
  }

  const portfolio = profile?.portfolio ?? [];
  const portfolioDetailed = portfolio.filter(
    (project) => project.evidenceStatus !== "high-level-context-only",
  ).length;

  return {
    name: profile?.displayName ?? "Your profile",
    headline: profile?.headline ?? "",
    targets: {
      roles,
      industries,
      level: {
        label: "Target level",
        value: band ? `${LEVEL_LABEL[band.min]} – ${LEVEL_LABEL[band.max]}` : null,
        // Read from the role titles above. There is no separate stored target
        // level, and presenting this as declared would invite the user to look
        // for a control that does not exist.
        source: "derived",
        from: "read from the roles you listed",
      },
      currentLevel: {
        label: "Current level",
        value: levelProfile.currentLevel === "unknown" ? null : LEVEL_LABEL[levelProfile.currentLevel],
        source: "derived",
        from: "read from your most recent résumé role",
      },
      track: {
        label: "Track",
        value: levelProfile.trackPreference
          ? TRACK_LABEL[levelProfile.trackPreference] ?? levelProfile.trackPreference
          : null,
        source: "declared",
      },
      years: {
        label: "Experience",
        value: levelProfile.yearsExperience === null ? null : `${levelProfile.yearsExperience} years`,
        source: "declared",
      },
    },
    work: {
      mode: preferences?.workMode ?? null,
      employmentTypes: strings(preferences?.employmentTypes),
      compensation: preferences?.compensation ?? null,
      exclusions: strings(preferences?.companyExclusions),
    },
    eligibility: {
      facts: eligibilityFacts,
      declared: Boolean(eligibilityFacts?.authorizedCountries?.length),
    },
    evidence: {
      areas: [...byCategory.values()].sort((left, right) => right.labels.length - left.labels.length),
      resumeRecords: profile?.resumeEvidence.length ?? 0,
      portfolioProjects: portfolio.length,
      portfolioDetailed,
    },
    gaps: findGaps({
      roles,
      industries,
      levelProfile,
      eligibilityDeclared: Boolean(eligibilityFacts?.authorizedCountries?.length),
      compensation: preferences?.compensation ?? null,
      workMode: preferences?.workMode ?? null,
      portfolioProjects: portfolio.length,
      portfolioDetailed,
    }),
    levelProfile,
  };
}

const TRACK_LABEL: Record<string, string> = {
  "individual-contributor": "Individual contributor",
  "player-coach": "Player-coach",
  "people-management": "People management",
  "executive-leadership": "Executive leadership",
};

/**
 * What to improve next, and only what genuinely changes a recommendation.
 *
 * This replaces "Profile strength 49%", a figure driven by how many context
 * documents exist rather than by anything the user would recognise as a state
 * of their career. A percentage cannot be acted on; a short list can, and it
 * can also be empty, which a meter never is.
 */
function findGaps(input: {
  roles: string[];
  industries: string[];
  levelProfile: CandidateLevelProfile;
  eligibilityDeclared: boolean;
  compensation: string | null;
  workMode: string | null;
  portfolioProjects: number;
  portfolioDetailed: number;
}): ProfileGap[] {
  const gaps: ProfileGap[] = [];

  if (!input.roles.length) {
    gaps.push({
      id: "roles",
      label: "Add the roles you are targeting",
      effect: "Without them Job Finder cannot tell which level of role suits you.",
      href: "#targets",
      material: true,
    });
  }

  if (!input.eligibilityDeclared) {
    gaps.push({
      id: "eligibility",
      label: "Say where you can work",
      effect:
        "Postings that state a work-authorization requirement are set aside for you to check by hand.",
      href: "#work-authorization",
      material: true,
    });
  }

  if (!input.levelProfile.trackPreference) {
    gaps.push({
      id: "track",
      label: "Say whether you want to manage people",
      effect: "Roles that lead a team and roles that do not are currently treated the same.",
      href: "#role-track",
      material: false,
    });
  }

  if (input.portfolioProjects > 0 && input.portfolioDetailed === 0) {
    gaps.push({
      id: "portfolio",
      label: "Add detail to your portfolio projects",
      effect: `All ${input.portfolioProjects} are mentions rather than worked examples, so they support fewer claims.`,
      href: "/evidence",
      material: false,
    });
  }

  if (!input.workMode) {
    gaps.push({
      id: "work-mode",
      label: "Say how you want to work",
      effect: "Remote, hybrid and on-site roles are shown without any note about fit.",
      href: "#work-preferences",
      material: false,
    });
  }

  return gaps;
}
