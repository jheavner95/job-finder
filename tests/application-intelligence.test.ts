import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  APPLICATION_STAGES,
  applicationAttentionStates,
  applicationBucket,
  isApplicationStage,
  isTerminalApplicationStage,
  nextApplicationStage,
  validApplicationTransition,
} from "../lib/application-intelligence";
import { createTestDatabase, releaseTestDatabases } from "./test-database";

afterEach(releaseTestDatabases);

describe("application lifecycle", () => {
  it("maps every supported stage into the CRM pipeline", () => {
    expect(APPLICATION_STAGES.every(isApplicationStage)).toBe(true);
    expect(applicationBucket("Preparing")).toBe("Preparing");
    expect(applicationBucket("Application Viewed")).toBe("Applied");
    expect(applicationBucket("Panel Interview")).toBe("Interviewing");
    expect(applicationBucket("Offer")).toBe("Offers");
    expect(applicationBucket("Rejected")).toBe("Closed");
    expect(nextApplicationStage("Preparing")).toBe("Applied");
    expect(isTerminalApplicationStage("Rejected")).toBe(true);
    expect(isTerminalApplicationStage("Offer")).toBe(false);
    expect(validApplicationTransition("Applied", "Recruiter Screen")).toBe(true);
    expect(validApplicationTransition("Applied", "Preparing")).toBe(false);
    expect(validApplicationTransition("Panel Interview", "Rejected")).toBe(true);
  });

  it("derives actionable attention states without inventing activity", () => {
    const now = new Date("2026-07-27T15:00:00.000Z");
    const states = applicationAttentionStates({
      status: "Applied",
      lastActivityAt: new Date("2026-07-12T15:00:00.000Z"),
      now,
      followUps: [
        { type: "Recruiter follow-up", dueAt: new Date("2026-07-26T15:00:00.000Z"), completedAt: null, cancelledAt: null },
      ],
      interviews: [
        { scheduledAt: new Date("2026-07-27T18:00:00.000Z"), completedAt: null, cancelledAt: null },
      ],
      dismissed: [],
    });

    expect(states.map((state) => state.type)).toEqual(expect.arrayContaining([
      "follow-up-overdue",
      "interview-today",
      "quiet-14",
    ]));
    expect(states.find((state) => state.type === "quiet-14")?.dismissible).toBe(true);
    expect(states.find((state) => state.type === "follow-up-overdue")?.dismissible).toBe(false);
  });

  it("preserves opportunity data, status history, timeline, documents, interviews, and reminders", async () => {
    const database = await createTestDatabase({ label: "application-intelligence" });

    const suffix = randomUUID();
    const job = await database.job.create({
      data: {
        fingerprint: `application-${suffix}`,
        sourceJobId: suffix,
        title: "Staff Product Designer",
        location: "Remote — United States",
        sourceUrl: `https://example.test/jobs/${suffix}`,
        originalSourceText: "Lead enterprise product design.",
        company: { create: { name: `Application company ${suffix}` } },
        source: { create: { name: `Application source ${suffix}` } },
      },
      include: { company: true, source: true },
    });
    const originalTitle = job.title;
    const application = await database.application.create({
      data: {
        jobId: job.id,
        company: job.company.name,
        role: job.title,
        location: job.location,
        sourceProvider: job.source.name,
        status: "Preparing",
        currentStage: "Preparing",
        statusHistory: { create: { status: "Preparing" } },
        timeline: { create: { type: "Application started" } },
      },
    });
    const resume = await database.applicationDocument.create({
      data: {
        applicationId: application.id,
        kind: "Resume",
        versionLabel: "Resume v1",
      },
    });
    const interviewAt = new Date(Date.now() + 86_400_000);
    const followUpAt = new Date(Date.now() + 172_800_000);
    await database.$transaction([
      database.application.update({
        where: { id: application.id },
        data: { status: "Applied", currentStage: "Applied", appliedAt: new Date() },
      }),
      database.applicationStatusHistory.create({
        data: { applicationId: application.id, status: "Applied" },
      }),
      database.applicationTimelineEvent.create({
        data: {
          applicationId: application.id,
          type: "Applied",
          relatedDocumentId: resume.id,
        },
      }),
      database.applicationInterview.create({
        data: {
          applicationId: application.id,
          round: "Recruiter screen",
          type: "Video",
          scheduledAt: interviewAt,
        },
      }),
      database.applicationFollowUp.create({
        data: {
          applicationId: application.id,
          type: "Thank-you",
          description: "Send thank-you email",
          dueAt: followUpAt,
        },
      }),
    ]);

    const persisted = await database.application.findUniqueOrThrow({
      where: { id: application.id },
      include: {
        job: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
        timeline: true,
        documents: true,
        interviews: true,
        followUps: true,
      },
    });
    expect(persisted.job.title).toBe(originalTitle);
    expect(persisted.statusHistory.map((item) => item.status)).toEqual(["Preparing", "Applied"]);
    expect(persisted.timeline.map((item) => item.type).sort()).toEqual(["Application started", "Applied"]);
    expect(persisted.documents[0].versionLabel).toBe("Resume v1");
    expect(persisted.interviews[0].round).toBe("Recruiter screen");
    expect(persisted.followUps[0].description).toBe("Send thank-you email");
  });
});
