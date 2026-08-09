/**
 * Employer identity aliases.
 *
 * One employer can enter the system under more than one name. A market source
 * may echo an ATS board token instead of the company's actual name, so the same
 * organisation ends up stored twice and identity comparisons fail.
 *
 * This is the smallest layer that fixes that: a curated, exact alias table plus
 * a canonicalising comparison. It deliberately does NOT introduce the
 * Employer / CareerSurface / Board split — board tokens and stored provider
 * data are untouched.
 *
 * Matching is EXACT on the normalised name. There is no fuzzy matching, no
 * similarity scoring, and no automatic merging. Two employers are the same only
 * when someone recorded evidence that they are. In particular there is no rule
 * that strips trailing digits — "Addepar1" maps to "Addepar" because of the
 * evidence noted below, not because of its shape.
 */
import { normalizeCompanyName } from "./board-resolution";

export type EmployerAlias = {
  /** The name this employer should be known by. */
  canonical: string;
  /** Other names the same employer has been observed under. */
  aliases: string[];
  /** Why these are known to be the same organisation. */
  evidence: string;
};

export const EMPLOYER_ALIASES: EmployerAlias[] = [
  {
    canonical: "Addepar",
    aliases: ["Addepar1"],
    evidence:
      "Addepar's public Greenhouse board is `addepar1`; there is no `addepar` board. "
      + "The market source that first named this employer echoed the board token rather "
      + "than the company name, so the same organisation was stored as \"Addepar1\".",
  },
];

/** normalisedAlias -> canonical display name. Built once, exact keys only. */
const CANONICAL_BY_ALIAS = new Map<string, string>();
for (const entry of EMPLOYER_ALIASES) {
  for (const name of [entry.canonical, ...entry.aliases]) {
    const key = normalizeCompanyName(name);
    if (key) CANONICAL_BY_ALIAS.set(key, entry.canonical);
  }
}

/**
 * The name this employer should be displayed and compared under. Returns the
 * input unchanged when no alias has been recorded.
 */
export function canonicalEmployerName(value: string) {
  const trimmed = value.trim();
  return CANONICAL_BY_ALIAS.get(normalizeCompanyName(trimmed)) ?? trimmed;
}

/** Stable comparison key: the normalised canonical name. */
export function canonicalEmployerKey(value: string) {
  return normalizeCompanyName(canonicalEmployerName(value));
}

/** True only when both names resolve to the same canonical employer. */
export function sameEmployer(left: string, right: string) {
  const a = canonicalEmployerKey(left);
  const b = canonicalEmployerKey(right);
  return a.length > 0 && a === b;
}

/** True when this exact name was recorded as an alias of another employer. */
export function isKnownAlias(value: string) {
  const key = normalizeCompanyName(value);
  const canonical = CANONICAL_BY_ALIAS.get(key);
  return Boolean(canonical) && normalizeCompanyName(canonical!) !== key;
}
