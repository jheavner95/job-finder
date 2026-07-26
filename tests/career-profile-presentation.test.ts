import { describe, expect, it } from "vitest";

import {
  careerProfileTasks,
  estimatedProfileMinutes,
  profileQuality,
} from "../lib/career-profile-presentation";
import { CONTEXT_DOCUMENTS, type ContextDocumentReadiness } from "../lib/context-readiness";

function documents(readiness: ContextDocumentReadiness["readiness"]) {
  return CONTEXT_DOCUMENTS.map((document) => ({
    ...document,
    readiness,
    lastUpdated: "2026-07-26",
    sourceStatus: "test",
  }));
}

describe("career profile presentation", () => {
  it("represents a fresh install as eight incomplete guided tasks", () => {
    const tasks = careerProfileTasks(documents("missing"));
    expect(tasks).toHaveLength(8);
    expect(tasks.every((task) => task.status === "missing")).toBe(true);
    expect(tasks.find((task) => task.id === "master-resume")?.href).toBe("/getting-started?step=1");
  });

  it("collapses every task into completed when all source areas are ready", () => {
    const tasks = careerProfileTasks(documents("ready"));
    expect(tasks.every((task) => task.statusLabel === "Complete")).toBe(true);
    expect(estimatedProfileMinutes(tasks)).toBe(0);
    expect(profileQuality(96)).toBe("High");
  });

  it("caps the displayed estimate at eight minutes", () => {
    expect(estimatedProfileMinutes(careerProfileTasks(documents("partial")))).toBe(8);
  });

  it("keeps completed resume and experience separate from partial portfolio work", () => {
    const mixed = documents("missing").map((document) => ({
      ...document,
      readiness: document.id === "master-resume" || document.id === "career-profile"
        ? "ready" as const
        : document.id === "portfolio-evidence"
          ? "partial" as const
          : document.readiness,
    }));
    const tasks = careerProfileTasks(mixed);
    expect(tasks.filter((task) => task.status === "ready").map((task) => task.id))
      .toEqual(["master-resume", "career-profile"]);
    expect(tasks.find((task) => task.id === "portfolio-evidence")?.statusLabel)
      .toBe("In progress");
  });
});
