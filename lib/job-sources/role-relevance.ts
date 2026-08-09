/**
 * Shared, discipline-level relevance screen for discovery.
 *
 * Discovery is deliberately RECALL-FIRST: it keeps anything that plausibly
 * belongs to the product design discipline and only drops postings that belong
 * to a demonstrably different craft or that are not real employment. Seniority,
 * salary, industry, location and company size are ranking concerns and are
 * owned elsewhere — they must never remove a posting here.
 */

export type RoleRelevance = {
  relevant: boolean;
  /** why it was kept or dropped, for the disposition ledger */
  detail: string;
  /** matched discipline signals, for diagnostics */
  signals: string[];
  /** set only when relevant === false */
  rejectedBy?: "unrelated-discipline" | "excluded-seniority" | "no-design-signal";
};

/**
 * Lowercase, fold `&`, strip punctuation to single spaces and singularize the
 * one plural that actually matters. Punctuation folding is what makes
 * comma-inverted titles ("Director, Product Design") and slashed titles
 * ("UX/UI Designer") match the same patterns as their plain forms.
 */
export function normalizeRoleTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bdesigners\b/g, "designer")
    .replace(/\s+/g, " ")
    .trim();
}

/** Not employment, or not a real role — always dropped. */
const SENIORITY_EXCLUSIONS: Array<[string, RegExp]> = [
  ["working student", /\bworking students?\b/],
  ["werkstudent", /\bwerkstudent(?:in)?\b/],
  ["graduate program", /\bgraduate programm?e?s?\b/],
  ["internship", /\binternships?\b/],
  ["intern", /\binterns?\b/],
  ["apprentice", /\bapprentice(?:ship)?s?\b/],
  ["co-op", /\bco op\b/],
  ["student", /\bstudents?\b/],
  ["trainee", /\btrainees?\b/],
];

/**
 * Crafts that use the word "design" but are a different discipline. Matched
 * adjacent to design/designer so that a legitimate product design title is
 * never dropped for merely mentioning one of these words in a domain suffix.
 */
const CRAFT_MODIFIERS = [
  "graphic",
  "graphics",
  "motion",
  "brand",
  "branding",
  "visual",
  // Marketing/creative crafts. Kept adjacent-matched so "Product Designer,
  // Growth & Monetization" and "Digital Product Designer" are unaffected.
  "creative",
  "marketing",
  "advertising",
  "communications",
  "3d",
  "exhibition",
  "spatial",
  "apparel",
  "footwear",
  "structural",
  "print",
  "packaging",
  "industrial",
  "interior",
  "fashion",
  "textile",
  "textiles",
  "jewelry",
  "jewellery",
  "floral",
  "kitchen",
  "set",
  "sound",
  "audio",
  "lighting",
  "game",
  "instructional",
  "curriculum",
  "mechanical",
  "electrical",
  "civil",
  "architectural",
  "landscape",
  "production",
  "model",
  "solution",
  "solutions",
];

const CRAFT_GROUP = CRAFT_MODIFIERS.join("|");
const CRAFT_BEFORE = new RegExp(`\\b(${CRAFT_GROUP}) (?:design|designer|designs)\\b`);
const CRAFT_AFTER = new RegExp(`\\bdesigner (${CRAFT_GROUP})\\b`);

/** Whole disciplines that are simply not design. */
const DISCIPLINE_EXCLUSIONS: Array<[string, RegExp]> = [
  ["engineer", /\bengineers?\b/],
  ["engineering", /\bengineering\b/],
  ["developer", /\bdevelopers?\b/],
  ["programmer", /\bprogrammers?\b/],
  ["CAD", /\bcad\b/],
  ["BIM", /\bbim\b/],
  ["advocate", /\badvocates?\b/],
];

/**
 * Engineering-family terms appear in two very different positions:
 *
 *   "Software Engineer"                        -> the role itself
 *   "Product Designer, Engineering Acceleration" -> the team the designer serves
 *
 * These labels may be overridden when the title separately names a product
 * design role. The remaining exclusions (CAD, BIM, advocate) are unaffected.
 */
const QUALIFIER_OVERRIDABLE = new Set(["engineer", "engineering", "developer", "programmer"]);

/**
 * Phrases that establish product design as the ROLE, not a modifier.
 *
 * Deliberately requires the "-er" noun ("product designer", not "product
 * design"). "Product Design Engineer" and "Senior Design Engineer" are
 * engineering roles that borrow the word design, and the noun form is what
 * separates them from "Product Designer, <domain>". A bare "designer" is also
 * excluded from this set, so "Engineering Designer" stays out.
 */
const ROLE_HEAD_SIGNALS = [
  /\bproduct designer\b/,
  /\bux designer\b/,
  /\bui designer\b/,
  /\buser experience designer\b/,
  /\buser interface designer\b/,
  /\binteraction designer\b/,
  /\bexperience designer\b/,
  /\bservice designer\b/,
  /\bdesign technologists?\b/,
  /\bux architects?\b/,
];

function namesProductDesignRole(value: string) {
  return ROLE_HEAD_SIGNALS.some((pattern) => pattern.test(value));
}

/** "architect" is engineering unless it is explicitly a UX architect. */
const ARCHITECT = /\barchitects?\b/;
const UX_ARCHITECT = /\b(?:ux|user experience|information|content) architects?\b/;

const INCLUSIONS: Array<[string, RegExp]> = [
  ["product design", /\bproduct design(?:er)?\b/],
  ["ux design", /\bux design(?:er)?\b/],
  ["ui design", /\bui design(?:er)?\b/],
  ["user experience design", /\buser experience design(?:er)?\b/],
  ["user interface design", /\buser interface design(?:er)?\b/],
  ["interaction design", /\binteraction design(?:er)?\b/],
  ["experience design", /\bexperience design(?:er)?\b/],
  ["service design", /\bservice design(?:er)?\b/],
  ["design technologist", /\bdesign technologists?\b/],
  ["ux architect", /\bux architects?\b/],
  [
    "design leadership",
    /\bdesign (?:lead|leads|leader|leadership|manager|management|director|head|ops|operations|program|programs|strategy|principal|systems?)\b/,
  ],
  [
    "design leadership",
    /\b(?:lead|head|director|vp|vice president|chief|principal|staff|senior|group|global)(?: of)? design\b/,
  ],
  ["designer", /\bdesigner\b/],
];

function unique(values: string[]) {
  return [...new Set(values)];
}

export function evaluateRoleRelevance(
  title: string,
  context?: { department?: string },
): RoleRelevance {
  const value = normalizeRoleTitle(title ?? "");
  if (!value) {
    return {
      relevant: false,
      detail: "Posting had no title to evaluate for discipline relevance.",
      signals: [],
      rejectedBy: "no-design-signal",
    };
  }

  const seniority = SENIORITY_EXCLUSIONS.find(([, pattern]) => pattern.test(value));
  if (seniority) {
    return {
      relevant: false,
      detail: `Title is a training or non-employment role ("${seniority[0]}").`,
      signals: [],
      rejectedBy: "excluded-seniority",
    };
  }

  const craft = CRAFT_BEFORE.exec(value) ?? CRAFT_AFTER.exec(value);
  if (craft) {
    return {
      relevant: false,
      detail: `Title belongs to a different design craft ("${craft[1]}").`,
      signals: [],
      rejectedBy: "unrelated-discipline",
    };
  }

  // A title that names a product design role keeps it even when an
  // engineering-family word appears as the domain or team qualifier.
  const applicableExclusions = namesProductDesignRole(value)
    ? DISCIPLINE_EXCLUSIONS.filter(([label]) => !QUALIFIER_OVERRIDABLE.has(label))
    : DISCIPLINE_EXCLUSIONS;
  const discipline = applicableExclusions.find(([, pattern]) => pattern.test(value));
  if (discipline) {
    return {
      relevant: false,
      detail: `Title belongs to a different discipline ("${discipline[0]}").`,
      signals: [],
      rejectedBy: "unrelated-discipline",
    };
  }

  if (ARCHITECT.test(value) && !UX_ARCHITECT.test(value)) {
    return {
      relevant: false,
      detail: 'Title belongs to a different discipline ("architect").',
      signals: [],
      rejectedBy: "unrelated-discipline",
    };
  }

  const signals = unique(
    INCLUSIONS.filter(([, pattern]) => pattern.test(value)).map(([label]) => label),
  );
  if (signals.length) {
    return {
      relevant: true,
      detail: `Title matched the product design discipline (${signals.join(", ")}).`,
      signals,
    };
  }

  // A design department can only corroborate a title that already carries a
  // design word; it must not sweep in recruiters or finance roles.
  const department = normalizeRoleTitle(context?.department ?? "");
  if (department && /\bdesign\b/.test(department) && /\bdesign\b/.test(value)) {
    return {
      relevant: true,
      detail: `Title carried a design term and sits in the "${context?.department}" department.`,
      signals: ["design department"],
    };
  }

  return {
    relevant: false,
    detail: "Title carried no product design discipline signal.",
    signals: [],
    rejectedBy: "no-design-signal",
  };
}
