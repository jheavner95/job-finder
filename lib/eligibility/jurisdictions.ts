/**
 * Jurisdictions the detector can name.
 *
 * This is deliberately a closed vocabulary rather than "any capitalised word".
 * DE-3D's corpus contains "a national boutique fitness company", "Idaho
 * National Laboratory", "national security", "the national base pay range" and
 * "Staff Product Designer, National Impact" — every one of which a permissive
 * pattern would read as a nationality requirement. Requiring a known country or
 * demonym is what keeps those out, without needing a blacklist of prose.
 */

export type Jurisdiction = {
  code: string;
  label: string;
  /** Supranational. A bloc can raise a review, but never an exclusion. */
  isBloc?: boolean;
  /** Country names and adjectival forms as they appear in postings. */
  names: string[];
  /** "a <demonym> citizen", "<demonym> nationals only". */
  demonyms: string[];
};

export const JURISDICTIONS: Jurisdiction[] = [
  {
    code: "US",
    label: "United States",
    names: ["United States of America", "United States", "U.S.A.", "U.S.", "USA", "US"],
    demonyms: ["American", "U.S.", "US", "United States"],
  },
  {
    code: "GB",
    label: "United Kingdom",
    names: ["United Kingdom", "Great Britain", "U.K.", "UK", "England", "Scotland", "Wales"],
    demonyms: ["British", "UK", "U.K."],
  },
  { code: "DE", label: "Germany", names: ["Germany", "Deutschland"], demonyms: ["German"] },
  { code: "SG", label: "Singapore", names: ["Singapore"], demonyms: ["Singaporean", "Singapore"] },
  { code: "KW", label: "Kuwait", names: ["Kuwait"], demonyms: ["Kuwaiti"] },
  { code: "CA", label: "Canada", names: ["Canada"], demonyms: ["Canadian"] },
  { code: "IE", label: "Ireland", names: ["Ireland", "Republic of Ireland"], demonyms: ["Irish"] },
  { code: "NL", label: "Netherlands", names: ["Netherlands", "the Netherlands", "Holland"], demonyms: ["Dutch"] },
  { code: "FR", label: "France", names: ["France"], demonyms: ["French"] },
  { code: "ES", label: "Spain", names: ["Spain"], demonyms: ["Spanish"] },
  { code: "PT", label: "Portugal", names: ["Portugal"], demonyms: ["Portuguese"] },
  { code: "IT", label: "Italy", names: ["Italy"], demonyms: ["Italian"] },
  { code: "PL", label: "Poland", names: ["Poland"], demonyms: ["Polish"] },
  { code: "SE", label: "Sweden", names: ["Sweden"], demonyms: ["Swedish"] },
  { code: "DK", label: "Denmark", names: ["Denmark"], demonyms: ["Danish"] },
  { code: "NO", label: "Norway", names: ["Norway"], demonyms: ["Norwegian"] },
  { code: "FI", label: "Finland", names: ["Finland"], demonyms: ["Finnish"] },
  { code: "CH", label: "Switzerland", names: ["Switzerland"], demonyms: ["Swiss"] },
  { code: "AT", label: "Austria", names: ["Austria"], demonyms: ["Austrian"] },
  { code: "BE", label: "Belgium", names: ["Belgium"], demonyms: ["Belgian"] },
  { code: "AU", label: "Australia", names: ["Australia"], demonyms: ["Australian"] },
  { code: "NZ", label: "New Zealand", names: ["New Zealand"], demonyms: ["New Zealand"] },
  { code: "IN", label: "India", names: ["India"], demonyms: ["Indian"] },
  { code: "JP", label: "Japan", names: ["Japan"], demonyms: ["Japanese"] },
  { code: "BR", label: "Brazil", names: ["Brazil"], demonyms: ["Brazilian"] },
  { code: "MX", label: "Mexico", names: ["Mexico"], demonyms: ["Mexican"] },
  { code: "AE", label: "United Arab Emirates", names: ["United Arab Emirates", "U.A.E.", "UAE"], demonyms: ["Emirati"] },
  { code: "IL", label: "Israel", names: ["Israel"], demonyms: ["Israeli"] },
  { code: "ZA", label: "South Africa", names: ["South Africa"], demonyms: ["South African"] },
  { code: "EU", label: "European Union", isBloc: true, names: ["European Union", "EU"], demonyms: ["EU"] },
  { code: "EEA", label: "European Economic Area", isBloc: true, names: ["European Economic Area", "EEA"], demonyms: ["EEA"] },
];

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest-first so "United States of America" wins over "United States". */
function alternation(values: string[]) {
  return [...values].sort((a, b) => b.length - a.length).map(escape).join("|");
}

export const COUNTRY_NAME_PATTERN = alternation(
  JURISDICTIONS.flatMap((item) => item.names),
);

export const DEMONYM_PATTERN = alternation(
  JURISDICTIONS.flatMap((item) => item.demonyms),
);

const BY_TOKEN = new Map<string, Jurisdiction>();
for (const jurisdiction of JURISDICTIONS) {
  for (const token of [...jurisdiction.names, ...jurisdiction.demonyms]) {
    // First writer wins, so "US" keeps its own entry rather than being
    // overwritten by a later jurisdiction that happens to share a token.
    const key = normalizeToken(token);
    if (!BY_TOKEN.has(key)) BY_TOKEN.set(key, jurisdiction);
  }
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Resolve a fragment of posting text to a jurisdiction.
 *
 * Matches the longest known token anywhere in the fragment, so
 * "the United Kingdom from the first day of employment" resolves to GB while
 * "the country in which they apply" resolves to nothing.
 */
export function resolveJurisdiction(fragment: string | null | undefined): Jurisdiction | null {
  if (!fragment) return null;
  const haystack = ` ${fragment.toLowerCase()} `;
  let best: { jurisdiction: Jurisdiction; length: number } | null = null;
  for (const jurisdiction of JURISDICTIONS) {
    for (const token of [...jurisdiction.names, ...jurisdiction.demonyms]) {
      const needle = token.toLowerCase();
      // Word-boundary aware without regex construction per token: require a
      // non-letter on each side so "us" does not match inside "because".
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) break;
        const before = haystack[at - 1] ?? " ";
        const after = haystack[at + needle.length] ?? " ";
        if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) {
          if (!best || needle.length > best.length) {
            best = { jurisdiction, length: needle.length };
          }
          break;
        }
        from = at + 1;
      }
    }
  }
  return best?.jurisdiction ?? null;
}

export function jurisdictionByCode(code: string): Jurisdiction | null {
  return JURISDICTIONS.find((item) => item.code === code.toUpperCase()) ?? null;
}

export function jurisdictionFromToken(token: string): Jurisdiction | null {
  return BY_TOKEN.get(normalizeToken(token)) ?? null;
}
