import type {
  ContextDocumentReadiness,
  ContextReadiness,
} from "./context-readiness";

export type ContextImpact = "High impact" | "Medium impact";

type ContextPresentation = {
  name: string;
  purpose: string;
  impact: ContextImpact;
  actionLabel: string;
  priority: number;
  missingSummary: Partial<Record<ContextReadiness, string>>;
  confidenceReason: Partial<Record<ContextReadiness, string>>;
};

export const CONTEXT_PRESENTATION: Record<string, ContextPresentation> = {
  "master-resume": {
    name: "Resume",
    purpose: "Provides verified employment history, project context, and role evidence.",
    impact: "High impact",
    actionLabel: "Add resume details",
    priority: 1,
    missingSummary: {
      missing: "Your complete, current resume has not been supplied.",
      template: "The resume structure exists but still needs your verified history.",
      partial: "Some resume evidence still needs to be confirmed.",
    },
    confidenceReason: {
      missing: "Current resume has not been supplied",
      template: "Current resume still needs verified career history",
      partial: "Current resume evidence is incomplete",
    },
  },
  "career-profile": {
    name: "Professional Profile",
    purpose: "Clarifies your strengths, positioning, industries, and career direction.",
    impact: "Medium impact",
    actionLabel: "Review professional profile",
    priority: 8,
    missingSummary: {
      missing: "Your professional positioning has not been defined.",
      template: "The profile structure exists but needs your input.",
      partial: "Some positioning and industry details remain unconfirmed.",
    },
    confidenceReason: {
      missing: "Professional positioning has not been supplied",
      template: "Professional profile still needs verified details",
      partial: "Professional profile remains partially confirmed",
    },
  },
  "role-requirements": {
    name: "Role Requirements",
    purpose: "Defines the role qualities that are required, preferred, or flexible.",
    impact: "High impact",
    actionLabel: "Refine role requirements",
    priority: 4,
    missingSummary: {
      missing: "Required and preferred role qualities have not been defined.",
      template: "Role criteria are structured but still need confirmation.",
      partial: "Some role requirements and tradeoffs remain unconfirmed.",
    },
    confidenceReason: {
      missing: "Role requirements have not been defined",
      template: "Role requirements still need confirmation",
      partial: "Role requirements remain partially confirmed",
    },
  },
  "company-preferences": {
    name: "Company Preferences",
    purpose: "Captures the environments, cultures, and product contexts where you thrive.",
    impact: "Medium impact",
    actionLabel: "Refine company preferences",
    priority: 5,
    missingSummary: {
      missing: "Preferred company environments have not been supplied.",
      template: "Company preferences are structured but need confirmation.",
      partial: "Some company preferences are inferred and remain unconfirmed.",
    },
    confidenceReason: {
      missing: "Company preferences have not been supplied",
      template: "Company preferences still need confirmation",
      partial: "Company preferences remain partially confirmed",
    },
  },
  compensation: {
    name: "Compensation",
    purpose: "Helps identify likely mismatches without penalizing roles that omit salary.",
    impact: "Medium impact",
    actionLabel: "Set compensation preferences",
    priority: 3,
    missingSummary: {
      missing: "Your compensation requirements have not been confirmed.",
      template: "Compensation fields exist but still need your values.",
      partial: "Some compensation requirements remain unconfirmed.",
    },
    confidenceReason: {
      missing: "Compensation requirements are not confirmed",
      template: "Compensation requirements still need confirmation",
      partial: "Compensation requirements remain partially confirmed",
    },
  },
  exclusions: {
    name: "Exclusions",
    purpose: "Separates true deal-breakers from preferences that should only affect ranking.",
    impact: "High impact",
    actionLabel: "Confirm exclusions",
    priority: 6,
    missingSummary: {
      missing: "Hard exclusions and deal-breakers have not been confirmed.",
      template: "Exclusion fields exist but still need confirmation.",
      partial: "No permanent hard exclusions have been confirmed.",
    },
    confidenceReason: {
      missing: "Hard exclusions have not been confirmed",
      template: "Hard exclusions still need confirmation",
      partial: "Hard exclusions remain partially confirmed",
    },
  },
  "portfolio-evidence": {
    name: "Portfolio Evidence",
    purpose: "Connects your real work to requirements found in job descriptions.",
    impact: "High impact",
    actionLabel: "Complete project evidence",
    priority: 2,
    missingSummary: {
      missing: "Project-level evidence has not been supplied.",
      template: "The evidence structure exists but needs verified projects.",
      partial: "Project contexts exist, but detailed outcomes and contributions are incomplete.",
    },
    confidenceReason: {
      missing: "Portfolio evidence has not been supplied",
      template: "Portfolio evidence still needs verified projects",
      partial: "Portfolio evidence is incomplete",
    },
  },
  "writing-voice": {
    name: "Writing Voice",
    purpose: "Preserves your natural voice in future user-reviewed career materials.",
    impact: "Medium impact",
    actionLabel: "Add writing examples",
    priority: 7,
    missingSummary: {
      missing: "Writing preferences and examples have not been supplied.",
      template: "Voice guidelines exist but still need your examples.",
      partial: "Style preferences are known, but writing examples remain limited.",
    },
    confidenceReason: {
      missing: "Writing voice has not been supplied",
      template: "Writing voice still needs examples",
      partial: "Writing examples remain limited",
    },
  },
};

export const READINESS_LABELS: Record<ContextReadiness, string> = {
  missing: "Not started",
  template: "Needs review",
  partial: "In progress",
  ready: "Complete",
};

export function presentContextDocument(document: ContextDocumentReadiness) {
  const presentation = CONTEXT_PRESENTATION[document.id];
  if (!presentation) {
    throw new Error(`Missing presentation mapping for ${document.id}`);
  }

  return {
    ...document,
    ...presentation,
    readinessLabel: READINESS_LABELS[document.readiness],
    missingInformation:
      document.readiness === "ready"
        ? "No known information gaps in this area."
        : presentation.missingSummary[document.readiness] ??
          "This area needs more verified information.",
    confidenceReason:
      document.readiness === "ready"
        ? null
        : presentation.confidenceReason[document.readiness] ?? null,
    href: `/context/${document.id}`,
  };
}

export function getNextContextActions(
  documents: ContextDocumentReadiness[],
  limit = 3,
) {
  return documents
    .map(presentContextDocument)
    .filter((document) => document.readiness !== "ready")
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit);
}
