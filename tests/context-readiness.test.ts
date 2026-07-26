import { describe, expect, it } from "vitest";
import {
  CONTEXT_DOCUMENTS,
  evaluateContextDocument,
  evaluateContextLibrary,
} from "../lib/context-readiness";

const definition = CONTEXT_DOCUMENTS[0];

function documentWith(readiness: string) {
  return `---
context_id: test
readiness: ${readiness}
last_updated: 2026-07-24
source_status: test-fixture
---

# Test
`;
}

describe("context readiness", () => {
  it.each(["missing", "template", "partial", "ready"] as const)(
    "maps explicit %s metadata",
    (readiness) => {
      expect(evaluateContextDocument(definition, documentWith(readiness)).readiness)
        .toBe(readiness);
    },
  );

  it("rejects absent or invalid readiness metadata", () => {
    expect(() => evaluateContextDocument(definition, "# No metadata")).toThrow(
      /readiness metadata/,
    );
    expect(() =>
      evaluateContextDocument(definition, documentWith("almost-ready")),
    ).toThrow(/readiness metadata/);
  });

  it("reports the calibrated state of the checked-in context library", async () => {
    const result = await evaluateContextLibrary();
    expect(result.documents).toHaveLength(8);
    expect(result.counts).toEqual({
      missing: 2,
      template: 0,
      partial: 6,
      ready: 0,
    });
    expect(result.percentage).toBe(49);
    expect(result.calibrated).toBe(false);
  });
});
