export type ParseConfidence =
  | "High confidence"
  | "Medium confidence"
  | "Low confidence"
  | "Unknown";

export type ParsedExperience = {
  employer: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  responsibilities: string[];
  sourceLines: string[];
  sourceExcerpt: string;
  confidence: ParseConfidence;
  needsReview: boolean;
};

export type ParsedResumeSection = {
  heading: string;
  lines: string[];
};

export type ParsedResume = {
  candidateName: string | null;
  contactDetails: string[];
  summary: string[];
  coreStrengths: string[];
  experience: ParsedExperience[];
  education: string[];
  certifications: string[];
  skills: string[];
  unclassifiedSections: ParsedResumeSection[];
};

type SectionKind =
  | "summary"
  | "strengths"
  | "skills"
  | "experience"
  | "education"
  | "certifications"
  | "projects";

type SourceLine = {
  value: string;
  section: SectionKind | "preamble" | "unclassified";
};

const SECTION_VARIANTS: Array<[SectionKind, RegExp]> = [
  ["summary", /^(professional\s+)?summary$|^profile$/i],
  ["strengths", /^core\s+(strengths|competencies|capabilities)$/i],
  ["skills", /^(technical\s+)?skills$|^areas\s+of\s+expertise$/i],
  ["experience", /^(professional\s+)?experience$|^employment(\s+history)?$|^work\s+history$/i],
  ["education", /^education(al\s+background)?$/i],
  ["certifications", /^certifications?|licenses?(\s+and\s+certifications?)?$/i],
  ["projects", /^(selected\s+|portfolio\s+)?projects?$/i],
];

const TITLE_PATTERN = /\b(product\s+designer|product\s+design\s+lead|ux\s+designer|ui\s+designer|ux\s+researcher|design\s+director|product\s+manager|consultant|contractor)\b/i;
const SENIORITY_PATTERN = /\b(senior|staff|principal|lead|head|director|manager)\b/i;
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_TOKEN = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const DATE_RANGE = new RegExp(`(${DATE_TOKEN})\\s*(?:–|—|-|to)\\s*(Present|Current|${DATE_TOKEN})`, "i");
const BULLET = /^\s*(?:[•●▪◦‣*+-]|\d+[.)])\s+/;
const CONTACT = /@|(?:https?:\/\/|linkedin\.com|www\.)|\+?\d[\d\s().-]{7,}/i;
const LOCATION = /\b(remote|hybrid|on-?site)\b|^[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5})?$/i;

function normalizedHeading(value: string) {
  return value
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/[:|—–-]+$/, "")
    .replace(/\s+/g, " ");
}

function sectionKind(value: string) {
  const normalized = normalizedHeading(value);
  return SECTION_VARIANTS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

function isTitle(value: string) {
  return TITLE_PATTERN.test(value)
    || (SENIORITY_PATTERN.test(value) && /\b(design|research|product|ux|ui)\b/i.test(value));
}

function parseDates(value: string) {
  const match = value.match(DATE_RANGE);
  return match
    ? {
        startDate: match[1].trim(),
        endDate: match[2].trim(),
        matchedText: match[0],
      }
    : null;
}

function stripDates(value: string) {
  const dates = parseDates(value);
  if (!dates) return value.trim();
  return value
    .replace(dates.matchedText, "")
    .replace(/^[\s|,;:—–-]+|[\s|,;:—–-]+$/g, "")
    .trim();
}

function roleParts(value: string) {
  const withoutDates = stripDates(value);
  const separators = [/\s+[—–]\s+/, /\s+\|\s+/, /\s+-\s+/, /,\s+/];
  for (const separator of separators) {
    const parts = withoutDates.split(separator).map((item) => item.trim()).filter(Boolean);
    if (parts.length !== 2) continue;
    const leftIsTitle = isTitle(parts[0]);
    const rightIsTitle = isTitle(parts[1]);
    if (leftIsTitle === rightIsTitle) continue;
    return leftIsTitle
      ? { employer: parts[1], title: parts[0] }
      : { employer: parts[0], title: parts[1] };
  }
  return null;
}

function meaningful(lines: SourceLine[], index: number, direction = 1) {
  for (let cursor = index; cursor >= 0 && cursor < lines.length; cursor += direction) {
    if (lines[cursor].value.trim()) return cursor;
  }
  return -1;
}

type RoleStart = {
  start: number;
  contentStart: number;
  employer: string;
  title: string;
  dates: ReturnType<typeof parseDates>;
  location: string | null;
  confidence: ParseConfidence;
};

function detectRoleStarts(lines: SourceLine[]) {
  const starts: RoleStart[] = [];
  const claimed = new Set<number>();
  const allowed = (line: SourceLine) =>
    line.section === "experience" || line.section === "preamble" || line.section === "unclassified";

  for (let index = 0; index < lines.length; index += 1) {
    if (!allowed(lines[index]) || !lines[index].value || claimed.has(index)) continue;
    const inline = roleParts(lines[index].value);
    if (inline) {
      const next = meaningful(lines, index + 1);
      const dates = parseDates(lines[index].value)
        ?? (next >= 0 && next <= index + 2 ? parseDates(lines[next].value) : null);
      const locationIndex = dates && next >= 0 && parseDates(lines[next].value)
        ? meaningful(lines, next + 1)
        : next;
      const location = locationIndex >= 0
        && locationIndex <= index + 2
        && LOCATION.test(lines[locationIndex].value)
        ? lines[locationIndex].value.trim()
        : null;
      const contentStart = Math.max(
        index + 1,
        dates && next >= 0 && parseDates(lines[next].value) ? next + 1 : index + 1,
        location ? locationIndex + 1 : index + 1,
      );
      starts.push({
        start: index,
        contentStart,
        ...inline,
        dates,
        location,
        confidence: dates ? "High confidence" : "Medium confidence",
      });
      claimed.add(index);
      if (dates && next >= 0 && parseDates(lines[next].value)) claimed.add(next);
      continue;
    }

    const dates = parseDates(lines[index].value);
    if (dates) {
      const previous = meaningful(lines, index - 1, -1);
      const beforePrevious = previous >= 0 ? meaningful(lines, previous - 1, -1) : -1;
      const next = meaningful(lines, index + 1);
      const afterNext = next >= 0 ? meaningful(lines, next + 1) : -1;
      const candidates = [
        { first: beforePrevious, second: previous, start: beforePrevious, contentStart: index + 1 },
        { first: next, second: afterNext, start: index, contentStart: afterNext + 1 },
      ];
      for (const candidate of candidates) {
        if (candidate.first < 0 || candidate.second < 0) continue;
        if (!allowed(lines[candidate.first]) || !allowed(lines[candidate.second])) continue;
        const first = stripDates(lines[candidate.first].value);
        const second = stripDates(lines[candidate.second].value);
        const firstIsTitle = isTitle(first);
        const secondIsTitle = isTitle(second);
        if (firstIsTitle === secondIsTitle) continue;
        const locationIndex = meaningful(lines, candidate.contentStart);
        const location = locationIndex >= 0
          && locationIndex <= candidate.contentStart + 1
          && LOCATION.test(lines[locationIndex].value)
          ? lines[locationIndex].value.trim()
          : null;
        starts.push({
          start: candidate.start,
          contentStart: location ? locationIndex + 1 : candidate.contentStart,
          employer: firstIsTitle ? second : first,
          title: firstIsTitle ? first : second,
          dates,
          location,
          confidence: "High confidence",
        });
        claimed.add(candidate.first);
        claimed.add(candidate.second);
        claimed.add(index);
        break;
      }
    }
  }

  return starts
    .filter((role, index, all) =>
      role.employer && role.title
      && all.findIndex((other) => other.start === role.start) === index)
    .sort((left, right) => left.start - right.start);
}

function responsibilities(lines: string[]) {
  const grouped: string[] = [];
  for (const source of lines) {
    const value = source.trim();
    if (!value || parseDates(value) || LOCATION.test(value)) continue;
    if (BULLET.test(source)) {
      grouped.push(source.replace(BULLET, "").trim());
    } else if (grouped.length && /^\s+/.test(source)) {
      grouped[grouped.length - 1] = `${grouped[grouped.length - 1]} ${value}`;
    } else {
      grouped.push(value);
    }
  }
  return grouped;
}

function sectionLines(lines: SourceLine[], section: SourceLine["section"]) {
  return lines
    .filter((line) => line.section === section && line.value.trim())
    .map((line) => line.value.replace(BULLET, "").trim());
}

export function parseResumeStructure(sourceText: string): ParsedResume {
  const rawLines = sourceText.replace(/\r\n?/g, "\n").split("\n");
  let activeSection: SourceLine["section"] = "preamble";
  let unclassifiedHeading = "Other";
  const lines: SourceLine[] = rawLines.map((value) => {
    const detected = sectionKind(value);
    if (detected) {
      activeSection = detected;
      return { value: "", section: detected };
    }
    const looksLikeHeading = value.trim()
      && value.trim().length < 64
      && !BULLET.test(value)
      && !parseDates(value)
      && /^[A-Z][A-Z\s/&-]+:?$/.test(value.trim());
    if (
      looksLikeHeading
      && activeSection !== "preamble"
      && activeSection !== "experience"
    ) {
      activeSection = "unclassified";
      unclassifiedHeading = normalizedHeading(value);
      return { value: "", section: "unclassified" };
    }
    return { value, section: activeSection };
  });

  const starts = detectRoleStarts(lines);
  const experience = starts.map((role, index): ParsedExperience => {
    const nextStart = starts[index + 1]?.start ?? lines.length;
    const sourceLines = lines
      .slice(role.start, nextStart)
      .map((line) => line.value)
      .filter((line) => line.trim());
    const responsibilityLines = lines
      .slice(role.contentStart, nextStart)
      .filter((line) => line.section === lines[role.start].section)
      .map((line) => line.value);
    const grouped = responsibilities(responsibilityLines);
    const needsReview = role.confidence !== "High confidence"
      || !role.dates
      || grouped.length === 0;
    return {
      employer: role.employer,
      title: role.title,
      startDate: role.dates?.startDate ?? null,
      endDate: role.dates?.endDate ?? null,
      location: role.location,
      responsibilities: grouped,
      sourceLines,
      sourceExcerpt: sourceLines.join("\n"),
      confidence: role.confidence,
      needsReview,
    };
  });

  const preamble = sectionLines(lines, "preamble")
    .filter((line) => !starts.some((role) => role.employer === line || role.title === line));
  const contactDetails = preamble.filter((line) => CONTACT.test(line));
  const candidateName = preamble.find((line) =>
    !CONTACT.test(line)
    && !isTitle(line)
    && !parseDates(line)
    && line.split(/\s+/).length >= 2
    && line.split(/\s+/).length <= 5) ?? null;
  const unclassifiedLines = sectionLines(lines, "unclassified");

  return {
    candidateName,
    contactDetails,
    summary: sectionLines(lines, "summary"),
    coreStrengths: sectionLines(lines, "strengths"),
    experience,
    education: sectionLines(lines, "education"),
    certifications: sectionLines(lines, "certifications"),
    skills: sectionLines(lines, "skills"),
    unclassifiedSections: unclassifiedLines.length
      ? [{ heading: unclassifiedHeading, lines: unclassifiedLines }]
      : [],
  };
}

export function parsedExperienceFromStored(value: unknown): ParsedExperience[] {
  if (Array.isArray(value)) return value as ParsedExperience[];
  if (
    value
    && typeof value === "object"
    && "experience" in value
    && Array.isArray(value.experience)
  ) {
    return value.experience as ParsedExperience[];
  }
  return [];
}
