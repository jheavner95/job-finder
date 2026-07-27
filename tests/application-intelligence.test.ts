import { copyFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  APPLICATION_STAGES,
  applicationBucket,
  isApplicationStage,
  nextApplicationStage,
} from "../lib/application-intelligence";

const databases: Array<{ client: PrismaClient; path: string }> = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async ({ client, path }) => {
    await client.$disconnect();
    unlinkSync(path);
  }));
});

describe("application lifecycle", () => {
  it("maps every supported stage into the CRM pipeline", () => {
    expect(APPLICATION_STAGES.every(isApplicationStage)).toBe(true);
    expect(applicationBucket("Preparing")).toBe("Preparing");
    expect(applicationBucket("Application Viewed")).toBe("Applied");
    expect(applicationBucket("Panel Interview")).toBe("Interviewing");
    expect(applicationBucket("Offer")).toBe("Offers");
    expect(applicationBucket("Rejected")).toBe("Closed");
    expect(nextApplicationStage("Preparing")).toBe("Applied");
  });

  it("preserves opportunity data, status history, timeline, documents, interviews, and reminders", async () => {
    const path = `/tmp/job-search-intelligence-aip-${randomUUID()}.db`;
    copyFileSync("prisma/dev.db", path);
    const database = new PrismaClient({ datasourceUrl: `file:${path}` });
    databases.push({ client: database, path });

    const job = await database.job.findFirstOrThrow({ include: { company: true, source: true } });
    await database.application.deleteMany({ where: { jobId: job.id } });
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
