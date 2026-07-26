import { describe, expect, it } from "vitest";

import type { ContextDocumentReadiness } from "../lib/context-readiness";
import {
  getNextContextActions,
  presentContextDocument,
} from "../lib/context-presentation";

function document(id: string, readiness: ContextDocumentReadiness["readiness"]) {
  return {
    id,
    readiness,
    file: `${id}.md`,
    label: id,
    category: "Test",
    description: "Test",
    lastUpdated: "2026-07-24",
    sourceStatus: "test",
  };
}

describe("context presentation", () => {
  it("maps technical records to user-facing labels", () => {
    const presented = presentContextDocument(document("master-resume", "missing"));
    expect(presented.name).toBe("Resume");
    expect(presented.readinessLabel).toBe("Not started");
    expect(presented.href).toBe("/context/master-resume");
  });

  it("supports every certified readiness state without invented percentages", () => {
    expect(
      (["missing", "template", "partial", "ready"] as const).map(
        (readiness) =>
          presentContextDocument(document("master-resume", readiness))
            .readinessLabel,
      ),
    ).toEqual([
      "Not started",
      "Needs review",
      "In progress",
      "Complete",
    ]);
  });

  it("prioritizes incomplete areas deterministically and excludes ready areas", () => {
    const actions = getNextContextActions([
      document("career-profile", "partial"),
      document("compensation", "missing"),
      document("portfolio-evidence", "partial"),
      document("master-resume", "ready"),
      document("role-requirements", "partial"),
    ]);
    expect(actions.map((action) => action.id)).toEqual([
      "portfolio-evidence",
      "compensation",
      "role-requirements",
    ]);
  });
});
