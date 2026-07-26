import type { ContextDocumentReadiness } from "./context-readiness";
import { READINESS_LABELS } from "./context-presentation";

export type CareerProfileTask = {
  id: string;
  label: string;
  status: ContextDocumentReadiness["readiness"];
  statusLabel: string;
  minutes: number;
  benefit: string;
  href: string;
};

const TASKS = [
  { id: "master-resume", label: "Resume imported", minutes: 3, benefit: "+18% match confidence", href: "/getting-started?step=1" },
  { id: "career-profile", label: "Experience reviewed", minutes: 3, benefit: "Stronger role and industry matching", href: "/getting-started?step=2" },
  { id: "portfolio-evidence", label: "Portfolio projects", minutes: 5, benefit: "+15% evidence coverage", href: "/getting-started?step=3" },
  { id: "compensation", label: "Compensation preferences", minutes: 2, benefit: "Better salary filtering", href: "/getting-started?step=4" },
  { id: "role-requirements", label: "Preferred industries", minutes: 2, benefit: "Prioritizes relevant opportunities", href: "/getting-started?step=4" },
  { id: "company-preferences", label: "Company preferences", minutes: 2, benefit: "Reduces unwanted recommendations", href: "/getting-started?step=4" },
  { id: "exclusions", label: "Excluded companies", minutes: 1, benefit: "Removes known mismatches", href: "/getting-started?step=4" },
  { id: "writing-voice", label: "Writing samples", minutes: 4, benefit: "Improves communication matching", href: "/context/writing-voice" },
] as const;

export function careerProfileTasks(documents: ContextDocumentReadiness[]): CareerProfileTask[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  return TASKS.map((task) => {
    const document = byId.get(task.id);
    const status = document?.readiness ?? "missing";
    return { ...task, status, statusLabel: READINESS_LABELS[status] };
  });
}

export function profileQuality(percentage: number) {
  if (percentage >= 90) return "High";
  if (percentage >= 65) return "Strong";
  if (percentage >= 40) return "Developing";
  return "Limited";
}

export function estimatedProfileMinutes(tasks: CareerProfileTask[]) {
  const remaining = tasks
    .filter((task) => task.status !== "ready")
    .reduce((total, task) => total + task.minutes, 0);
  return Math.min(8, remaining);
}
