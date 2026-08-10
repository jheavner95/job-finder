/**
 * Work-mode compatibility.
 *
 * The fourth question Job Finder answers, and the third one that does not
 * belong in the match score:
 *
 *   score       — how well does the work fit this candidate's craft?
 *   eligibility — can they pursue it at all?
 *   level fit   — is it right for where they are in their career?
 *   work mode   — does the working arrangement suit how they want to work?
 *
 * DE-3L modelled putting this inside the weighted score and rejected it on the
 * corpus's own evidence. AlphaSense lists one Senior/Staff Product Designer
 * role in New York, the UK and Helsinki. The work is identical; scoring work
 * mode gave the three listings different *match* scores, which is incoherent —
 * a match score cannot depend on which office the posting names. It also
 * demoted the corpus's strongest role out of Excellent Fit for the sole reason
 * that its location field mentioned no work mode, reintroducing exactly the
 * "absence lowers the score" defect DE-3J had just removed.
 *
 * So this stays outside the number. A role can be an excellent match and be
 * on-site in the wrong city; those are two true statements, and collapsing
 * them into one number destroys both.
 *
 * Nothing here is persisted. The verdict is a pure function of data already
 * stored, so revising the preference re-answers every job immediately.
 */

export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export type WorkModeCompatibility =
  | "COMPATIBLE"
  | "INCOMPATIBLE"
  | "UNKNOWN"
  | "NO_PREFERENCE";

export type WorkModeAssessment = {
  compatibility: WorkModeCompatibility;
  postingMode: WorkMode;
  /** Modes the candidate said they want. Empty when nothing is declared. */
  preferred: WorkMode[];
  /** Where the posting restricts remote work, e.g. "US", "Canada: select locations". */
  geographicRestriction: string | null;
  /** Verbatim text the posting mode was read from. */
  evidence: string | null;
  headline: string;
};

const MODE_LABEL: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Not stated",
};

export function workModeLabel(mode: WorkMode) {
  return MODE_LABEL[mode];
}

/* ------------------------------------------------------------------ *
 * Posting side
 * ------------------------------------------------------------------ */

/**
 * Read the work mode from the location string.
 *
 * Deliberately the same narrow source the importer already uses. A survey of
 * the 429-job corpus found the posting body is not a usable substitute:
 * keyword signals there disagreed with the location field on 48 postings and
 * agreed on only 24, because bodies mention offices, relocation support and
 * in-person interviews without describing the arrangement. An explicit
 * "Hybrid" or "OnSite" token in the location field is the one signal that
 * proved trustworthy.
 *
 * Hybrid is tested first: "Cardiff, London or Remote (UK), Hybrid" is a hybrid
 * role that also says remote.
 */
export function postingWorkMode(location: string | null, remoteStatus: string | null): {
  mode: WorkMode;
  evidence: string | null;
} {
  const haystack = `${remoteStatus ?? ""} ${location ?? ""}`;
  const match = (pattern: RegExp): string | null => pattern.exec(haystack)?.[0]?.trim() ?? null;

  const hybrid = match(/\bhybrid\b/i);
  if (hybrid) return { mode: "hybrid", evidence: hybrid };
  const remote = match(/\b(?:remote|distributed|work from anywhere)\b/i);
  if (remote) return { mode: "remote", evidence: remote };
  const onsite = match(/\b(?:on[\s-]?site|in office|in-person)\b/i);
  if (onsite) return { mode: "onsite", evidence: onsite };

  // A city with no stated arrangement is unknown, never on-site. Most postings
  // in the corpus name a city and say nothing about how the work happens.
  return { mode: "unknown", evidence: null };
}

/**
 * Where a remote role is restricted to.
 *
 * Only reported, never scored. "Remote - US" is a real constraint on who can
 * take the job, but whether it excludes this candidate is an eligibility
 * question, and DE-3E deliberately refuses to infer eligibility from a
 * location field.
 */
export function remoteRestriction(location: string | null): string | null {
  if (!location) return null;
  const patterns: RegExp[] = [
    /remote\s*[-–—:(]?\s*((?:United States|USA|US|United Kingdom|UK|Canada|Europe|EMEA|EU|India|Germany|Brazil|LATAM|Poland|Australia)\b[^,;)]*)/i,
    /\b((?:United States|USA|US|Canada|United Kingdom|UK)\s*[-–—]\s*remote[^,;)]*)/i,
    /remote\s*\(([^)]{1,40})\)/i,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(location);
    if (found) return found[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Candidate side
 * ------------------------------------------------------------------ */

/**
 * Parse the declared preference.
 *
 * `CandidateCareerPreferences.workMode` is a single optional string offering
 * "Remote", "Hybrid", "Remote or Hybrid" or nothing. It records what the
 * candidate wants and provides no way to say how firmly — there is no
 * distinction between a hard constraint and a mild leaning. Every verdict here
 * is therefore worded as a preference, never as a bar.
 */
export function preferredWorkModes(workMode: string | null | undefined): WorkMode[] {
  if (!workMode) return [];
  const value = workMode.toLowerCase();
  const modes: WorkMode[] = [];
  if (/\bremote\b/.test(value)) modes.push("remote");
  if (/\bhybrid\b/.test(value)) modes.push("hybrid");
  if (/\bon[\s-]?site\b|\bin office\b/.test(value)) modes.push("onsite");
  return modes;
}

/* ------------------------------------------------------------------ *
 * Verdict
 * ------------------------------------------------------------------ */

export function assessWorkMode(
  location: string | null,
  remoteStatus: string | null,
  candidateWorkMode: string | null | undefined,
): WorkModeAssessment {
  const { mode, evidence } = postingWorkMode(location, remoteStatus);
  const preferred = preferredWorkModes(candidateWorkMode);
  const geographicRestriction = mode === "remote" ? remoteRestriction(location) : null;

  const base = { postingMode: mode, preferred, geographicRestriction, evidence };

  if (!preferred.length) {
    return { ...base, compatibility: "NO_PREFERENCE", headline: "No work-mode preference is recorded." };
  }
  if (mode === "unknown") {
    // Absence of a stated arrangement is not a mismatch. It is a question.
    return {
      ...base,
      compatibility: "UNKNOWN",
      headline: "This posting does not say how the work happens.",
    };
  }
  if (preferred.includes(mode)) {
    return {
      ...base,
      compatibility: "COMPATIBLE",
      headline: geographicRestriction
        ? `${MODE_LABEL[mode]}, limited to ${geographicRestriction}.`
        : `${MODE_LABEL[mode]}, which matches how you want to work.`,
    };
  }
  return {
    ...base,
    compatibility: "INCOMPATIBLE",
    headline: `${MODE_LABEL[mode]}, and you asked for ${preferred.map((item) => MODE_LABEL[item].toLowerCase()).join(" or ")}.`,
  };
}

export function workModeTone(
  compatibility: WorkModeCompatibility,
): "clear" | "warning" | "blocked" | "neutral" {
  switch (compatibility) {
    case "COMPATIBLE":
      return "clear";
    case "INCOMPATIBLE":
      return "blocked";
    case "UNKNOWN":
      return "warning";
    default:
      return "neutral";
  }
}

export function workModeCompatibilityLabel(compatibility: WorkModeCompatibility): string {
  switch (compatibility) {
    case "COMPATIBLE":
      return "Work mode fits";
    case "INCOMPATIBLE":
      return "Work-mode mismatch";
    case "UNKNOWN":
      return "Work mode not stated";
    default:
      return "No work-mode preference";
  }
}
