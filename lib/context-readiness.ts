import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const CONTEXT_READINESS_LEVELS = [
  "missing",
  "template",
  "partial",
  "ready",
] as const;

export type ContextReadiness = (typeof CONTEXT_READINESS_LEVELS)[number];

export type ContextDocumentDefinition = {
  id: string;
  file: string;
  label: string;
  category: string;
  description: string;
};

export type ContextDocumentReadiness = ContextDocumentDefinition & {
  readiness: ContextReadiness;
  lastUpdated: string;
  sourceStatus: string;
};

export const CONTEXT_DOCUMENTS: ContextDocumentDefinition[] = [
  { id: "master-resume", file: "master-resume.md", label: "Master resume", category: "Career record", description: "Original resume boundary and normalized ingestion fields" },
  { id: "career-profile", file: "career-profile.md", label: "Career profile", category: "Positioning", description: "Confirmed strengths, industries, and professional positioning" },
  { id: "role-requirements", file: "role-requirements.md", label: "Role requirements", category: "Search criteria", description: "Positive signals, lower-ranking defaults, and unknown hard requirements" },
  { id: "company-preferences", file: "company-preferences.md", label: "Company preferences", category: "Preferences", description: "Product-environment signals and company-specific unknowns" },
  { id: "compensation", file: "compensation.md", label: "Compensation", category: "Constraints", description: "Private values and neutral treatment of unknown compensation" },
  { id: "exclusions", file: "exclusions.md", label: "Exclusions", category: "Guardrails", description: "Separate hard exclusions from ranking concerns" },
  { id: "portfolio-evidence", file: "portfolio-evidence.md", label: "Portfolio evidence", category: "Evidence", description: "Normalized project evidence structure and known contexts" },
  { id: "writing-voice", file: "writing-voice.md", label: "Writing voice", category: "Voice", description: "Confirmed style constraints and missing writing samples" },
];

function metadataValue(content: string, key: string): string | null {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return null;
  const line = frontmatter[1]
    .split("\n")
    .find((entry) => entry.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : null;
}

export function evaluateContextDocument(
  definition: ContextDocumentDefinition,
  content: string,
): ContextDocumentReadiness {
  const readiness = metadataValue(content, "readiness");
  if (
    !readiness ||
    !CONTEXT_READINESS_LEVELS.includes(readiness as ContextReadiness)
  ) {
    throw new Error(`${definition.file} has invalid or missing readiness metadata`);
  }
  const lastUpdated = metadataValue(content, "last_updated");
  const sourceStatus = metadataValue(content, "source_status");
  if (!lastUpdated || !sourceStatus) {
    throw new Error(`${definition.file} is missing required context metadata`);
  }
  return {
    ...definition,
    readiness: readiness as ContextReadiness,
    lastUpdated,
    sourceStatus,
  };
}

export async function evaluateContextLibrary(
  contextDirectory = join(process.cwd(), "context"),
) {
  const documents = await Promise.all(
    CONTEXT_DOCUMENTS.map(async (definition) => {
      try {
        const content = await readFile(join(contextDirectory, definition.file), "utf8");
        return evaluateContextDocument(definition, content);
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return {
            ...definition,
            readiness: "missing" as const,
            lastUpdated: "Not available",
            sourceStatus: "file-missing",
          };
        }
        throw error;
      }
    }),
  );
  const readinessWeight: Record<ContextReadiness, number> = {
    missing: 0,
    template: 0.25,
    partial: 0.65,
    ready: 1,
  };
  const percentage = Math.round(
    (documents.reduce(
      (sum, document) => sum + readinessWeight[document.readiness],
      0,
    ) /
      documents.length) *
      100,
  );
  return {
    documents,
    percentage,
    counts: Object.fromEntries(
      CONTEXT_READINESS_LEVELS.map((level) => [
        level,
        documents.filter((document) => document.readiness === level).length,
      ]),
    ) as Record<ContextReadiness, number>,
    calibrated: documents.every((document) => document.readiness === "ready"),
  };
}
