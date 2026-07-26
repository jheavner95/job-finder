import type { EvidenceQuality } from "./readiness";

export type ImportedResumeEvidence = {
  employer: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  responsibilities: string[];
  leadership: string[];
  domains: string[];
  industries: string[];
  products: string[];
  technologies: string[];
  methods: string[];
  collaboration: string[];
  research: string[];
  accessibility: string[];
  ai: string[];
  designSystems: string[];
  enterprise: string[];
  sourceDocument: string;
  sourceExcerpt: string;
  evidenceQuality: EvidenceQuality;
};

const FIELD_NAMES = [
  "dates",
  "responsibilities",
  "leadership",
  "domains",
  "industries",
  "products",
  "technologies",
  "methods",
  "collaboration",
  "research",
  "accessibility",
  "ai",
  "design systems",
  "enterprise",
] as const;

function values(value: string | undefined) {
  if (!value || /^(unknown|not supplied|none)$/i.test(value.trim())) return [];
  return value.split(/\s*;\s*/).map((item) => item.trim()).filter(Boolean);
}

export function extractResumeEvidence(
  markdown: string,
  sourceDocument = "master-resume.md",
): ImportedResumeEvidence[] {
  if (/Current resume source:\s*not supplied/i.test(markdown)) return [];
  const quality: EvidenceQuality = /source_status:\s*verified/i.test(markdown)
    ? "Verified"
    : /source_status:\s*(confirmed|user-supplied)/i.test(markdown)
      ? "Confirmed"
      : "Partial";
  const sections = markdown.split(/^###\s+/m).slice(1);
  return sections.flatMap((section) => {
    const [heading = "", ...bodyLines] = section.split("\n");
    const [employerValue, titleValue] = heading.split(/\s+\|\s+/, 2);
    const employer = employerValue?.trim();
    const title = titleValue?.trim();
    const body = bodyLines.join("\n").trim();
    if (!employer || !title) return [];
    const fields = Object.fromEntries(FIELD_NAMES.map((name) => {
      const match = body.match(new RegExp(`^-\\s*${name}:\\s*(.+)$`, "im"));
      return [name, match?.[1]?.trim()];
    }));
    const dates = values(fields.dates);
    return [{
      employer,
      title,
      startDate: dates[0] ?? null,
      endDate: dates[1] ?? null,
      responsibilities: values(fields.responsibilities),
      leadership: values(fields.leadership),
      domains: values(fields.domains),
      industries: values(fields.industries),
      products: values(fields.products),
      technologies: values(fields.technologies),
      methods: values(fields.methods),
      collaboration: values(fields.collaboration),
      research: values(fields.research),
      accessibility: values(fields.accessibility),
      ai: values(fields.ai),
      designSystems: values(fields["design systems"]),
      enterprise: values(fields.enterprise),
      sourceDocument,
      sourceExcerpt: `### ${employer} | ${title}\n${body}`,
      evidenceQuality: quality,
    }];
  });
}
