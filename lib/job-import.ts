import { z } from "zod";

import { createJobFingerprint } from "./fingerprint";
import { scoreJob, type ScoreResult } from "./scoring";
import type { CategoryInput } from "./types";

const optionalText = z.string().trim().max(500).optional().default("");

export const jobImportSchema = z.object({
  title: z.string().trim().min(1, "Job title is required.").max(300),
  company: z.string().trim().min(1, "Company is required.").max(300),
  description: z
    .string()
    .trim()
    .min(1, "Paste the complete job description before previewing.")
    .max(100_000),
  url: z
    .string()
    .trim()
    .max(2_000)
    .refine(
      (value) => !value || /^https?:\/\/\S+$/i.test(value),
      "Enter a valid http or https job URL.",
    )
    .optional()
    .default(""),
  source: optionalText,
  salary: optionalText,
  location: optionalText,
  employmentType: optionalText,
});

export type JobImportInput = z.infer<typeof jobImportSchema>;

export type NormalizedJobImport = {
  title: string;
  company: string;
  description: string;
  sourceUrl: string;
  source: string;
  salary: string | null;
  location: string | null;
  remoteStatus: string | null;
  employmentType: string | null;
  requirements: string[];
  concerns: string[];
  fingerprint: string;
};

export type JobImportPreview = {
  input: JobImportInput;
  normalized: NormalizedJobImport;
  evaluation: ScoreResult;
};

function cleanWhitespace(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function linesFromDescription(description: string) {
  return description
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•*–—-]+/, "").trim())
    .filter(Boolean);
}

function selectLines(
  lines: string[],
  patterns: RegExp[],
  limit: number,
) {
  return lines
    .filter((line) => patterns.some((pattern) => pattern.test(line)))
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, limit);
}

function remoteStatus(location: string) {
  if (/\bhybrid\b/i.test(location)) return "Hybrid";
  if (/\b(remote|distributed)\b/i.test(location)) return "Remote";
  if (/\b(on[\s-]?site|in office)\b/i.test(location)) return "On-site";
  return "";
}

function keywordInput(
  category: CategoryInput["category"],
  description: string,
  patterns: RegExp[],
  reason: string,
): CategoryInput {
  const matches = patterns.filter((pattern) => pattern.test(description));
  if (!matches.length) {
    return {
      category,
      reason: `The posting does not provide enough explicit evidence for ${reason}.`,
      evidenceState: "missing",
    };
  }
  return {
    category,
    rating: Math.min(1, 0.45 + matches.length * 0.12),
    reason: `The posting contains ${matches.length} explicit signal${matches.length === 1 ? "" : "s"} for ${reason}.`,
    evidence: `Deterministic keyword signals found in the preserved posting: ${patterns
      .filter((pattern) => pattern.test(description))
      .map((pattern) => pattern.source.replaceAll("\\b", ""))
      .slice(0, 4)
      .join(", ")}.`,
    evidenceState: "positive",
  };
}

export function buildImportScoringInputs(
  normalized: NormalizedJobImport,
): CategoryInput[] {
  const text = `${normalized.title}\n${normalized.description}`;
  const riskPatterns = [
    /\btravel\b/i,
    /\bon[\s-]?site\b/i,
    /\bfast[\s-]?paced\b/i,
    /\bwear many hats\b/i,
    /\bweekend\b/i,
  ];
  const riskMatches = riskPatterns.filter((pattern) => pattern.test(text));

  return [
    keywordInput(
      "roleFit",
      text,
      [/\bproduct design\b/i, /\buser experience\b/i, /\bend[\s-]to[\s-]end\b/i, /\bproduct designer\b/i],
      "product-design responsibility fit",
    ),
    keywordInput(
      "seniorityFit",
      text,
      [/\bsenior\b/i, /\bstaff\b/i, /\bprincipal\b/i, /\blead(?:ership)?\b/i, /\bmentor\b/i],
      "senior-level scope",
    ),
    keywordInput(
      "domainFit",
      text,
      [/\benterprise\b/i, /\bplatform\b/i, /\bb2b\b/i, /\bworkflow\b/i, /\bdeveloper\b/i, /\bregulated\b/i, /\binternal tools?\b/i],
      "transferable product-domain complexity",
    ),
    keywordInput(
      "strategicScope",
      text,
      [/\bstrateg(?:y|ic)\b/i, /\bvision\b/i, /\broadmap\b/i, /\bownership\b/i, /\bdrive\b/i, /\binfluence\b/i],
      "strategic product scope",
    ),
    keywordInput(
      "handsOnDesign",
      text,
      [/\bprototype\b/i, /\bfigma\b/i, /\bdesign systems?\b/i, /\buser research\b/i, /\busability\b/i, /\binteraction design\b/i],
      "hands-on design expectations",
    ),
    {
      category: "portfolioEvidence",
      reason:
        "Portfolio-to-requirement evidence must be confirmed separately from the job posting.",
      evidenceState: "missing",
    },
    {
      category: "compensationFit",
      reason: normalized.salary
        ? "The posting supplies compensation, but candidate compensation requirements are not confirmed."
        : "The posting does not supply compensation and candidate requirements are not confirmed.",
      evidenceState: "missing",
    },
    {
      category: "locationFit",
      reason: normalized.location
        ? "The posting supplies a location, but candidate location constraints require confirmation."
        : "The posting does not supply a location.",
      evidenceState: "missing",
    },
    {
      category: "companyPreference",
      reason:
        "Company-environment fit requires verified company context beyond this posting.",
      evidenceState: "missing",
    },
    riskMatches.length
      ? {
          category: "riskPenalty",
          rating: Math.min(1, 0.2 + riskMatches.length * 0.15),
          reason: `The posting contains ${riskMatches.length} explicit condition${riskMatches.length === 1 ? "" : "s"} that may require review.`,
          evidenceState: "negative",
        }
      : {
          category: "riskPenalty",
          reason: "No explicit risk condition was detected in the supplied posting.",
          evidenceState: "not_applicable",
        },
  ];
}

export function normalizeJobImport(input: JobImportInput): NormalizedJobImport {
  const description = cleanWhitespace(input.description);
  const location = cleanWhitespace(input.location);
  const lines = linesFromDescription(description);
  const fingerprint = createJobFingerprint({
    company: input.company,
    title: input.title,
    location,
  });

  return {
    title: cleanWhitespace(input.title),
    company: cleanWhitespace(input.company),
    description,
    sourceUrl: input.url || `manual://job/${fingerprint}`,
    source: cleanWhitespace(input.source) || "Manual import",
    salary: cleanWhitespace(input.salary) || null,
    location: location || null,
    remoteStatus: remoteStatus(location) || null,
    employmentType: cleanWhitespace(input.employmentType) || null,
    requirements: selectLines(
      lines,
      [
        /\b(required|requirements?|qualifications?)\b/i,
        /\b(must|you have|experience with|years? of experience)\b/i,
        /\b(responsibilities|you will|you'll)\b/i,
      ],
      12,
    ),
    concerns: selectLines(
      lines,
      [/\btravel\b/i, /\bon[\s-]?site\b/i, /\bfast[\s-]?paced\b/i, /\bweekend\b/i],
      5,
    ),
    fingerprint,
  };
}

export function createJobImportPreview(input: JobImportInput): JobImportPreview {
  const normalized = normalizeJobImport(input);
  return {
    input,
    normalized,
    evaluation: scoreJob(buildImportScoringInputs(normalized)),
  };
}
