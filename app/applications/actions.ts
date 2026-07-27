"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import {
  APPLICATION_OUTCOMES,
  isApplicationStage,
} from "@/lib/application-intelligence";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function dateValue(formData: FormData, key: string, fallback = new Date()) {
  const value = text(formData, key);
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function revalidateApplication(applicationId: string) {
  revalidatePath("/");
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
}

export async function createApplicationAction(formData: FormData) {
  const jobId = text(formData, "jobId");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { company: true, source: true, application: true },
  });
  if (!job) redirect("/review");
  if (job.application) redirect(`/applications/${job.application.id}`);

  const created = await prisma.application.create({
    data: {
      jobId: job.id,
      status: "Preparing",
      currentStage: "Preparing",
      applicationUrl: optionalText(formData, "applicationUrl") ?? job.sourceUrl,
      company: optionalText(formData, "company") ?? job.company.name,
      role: optionalText(formData, "role") ?? job.title,
      location: optionalText(formData, "location") ?? job.location,
      salary: optionalText(formData, "salary") ?? job.compensationText,
      recruiter: optionalText(formData, "recruiter"),
      hiringManager: optionalText(formData, "hiringManager"),
      sourceProvider: job.source.name,
      industry: optionalText(formData, "industry"),
      notes: optionalText(formData, "notes"),
      statusHistory: {
        create: { status: "Preparing", notes: "Application preparation started." },
      },
      timeline: {
        create: { type: "Application started", notes: "Created from the opportunity review." },
      },
    },
  });
  revalidateApplication(created.id);
  revalidatePath(`/jobs/${job.id}`);
  redirect(`/applications/${created.id}?created=1`);
}

export async function updateApplicationStatusAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const requestedStatus = text(formData, "status");
  const status = requestedStatus === "No response" ? "Closed" : requestedStatus;
  const notes = optionalText(formData, "notes");
  if (!isApplicationStage(status)) redirect(`/applications/${applicationId}?error=status`);
  const application = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!application) redirect("/applications");

  const isApplied = status === "Applied" && !application.appliedAt;
  const isOutcome = APPLICATION_OUTCOMES.includes(requestedStatus as (typeof APPLICATION_OUTCOMES)[number]);
  await prisma.$transaction([
    prisma.application.update({
      where: { id: application.id },
      data: {
        status,
        currentStage: status,
        appliedAt: isApplied ? new Date() : undefined,
        outcome: isOutcome ? requestedStatus : undefined,
        rejectionReason: status === "Rejected" ? optionalText(formData, "rejectionReason") : undefined,
        archived: status === "Closed",
      },
    }),
    prisma.applicationStatusHistory.create({
      data: { applicationId: application.id, status, notes },
    }),
    prisma.applicationTimelineEvent.create({
      data: {
        applicationId: application.id,
        type: requestedStatus,
        notes: notes ?? (status === "Applied" ? "Application marked as submitted externally." : null),
      },
    }),
  ]);
  revalidateApplication(application.id);
  redirect(`/applications/${application.id}?updated=1`);
}

export async function addTimelineEventAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  await prisma.applicationTimelineEvent.create({
    data: {
      applicationId,
      type: text(formData, "type") || "Note",
      notes: optionalText(formData, "notes"),
      eventAt: dateValue(formData, "eventAt"),
      relatedContactId: optionalText(formData, "relatedContactId"),
      relatedDocumentId: optionalText(formData, "relatedDocumentId"),
    },
  });
  revalidateApplication(applicationId);
}

export async function addContactAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const name = text(formData, "name");
  if (!name) return;
  const contact = await prisma.applicationContact.create({
    data: {
      applicationId,
      kind: text(formData, "kind") || "Recruiter",
      name,
      role: optionalText(formData, "role"),
      email: optionalText(formData, "email"),
      linkedin: optionalText(formData, "linkedin"),
      notes: optionalText(formData, "notes"),
    },
  });
  await prisma.applicationTimelineEvent.create({
    data: {
      applicationId,
      type: "Contact added",
      notes: `${contact.name} added as ${contact.kind}.`,
      relatedContactId: contact.id,
    },
  });
  revalidateApplication(applicationId);
}

export async function addCommunicationAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const summary = text(formData, "summary");
  if (!summary) return;
  const channel = text(formData, "channel") || "Email";
  const direction = text(formData, "direction") || "Received";
  const occurredAt = dateValue(formData, "occurredAt");
  await prisma.$transaction([
    prisma.applicationCommunication.create({
      data: {
        applicationId,
        channel,
        direction,
        summary,
        occurredAt,
        attachment: optionalText(formData, "attachment"),
        contactId: optionalText(formData, "contactId"),
      },
    }),
    prisma.applicationTimelineEvent.create({
      data: {
        applicationId,
        type: `${channel} ${direction.toLowerCase()}`,
        notes: summary,
        eventAt: occurredAt,
        relatedContactId: optionalText(formData, "contactId"),
      },
    }),
  ]);
  revalidateApplication(applicationId);
}

export async function addDocumentAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const versionLabel = text(formData, "versionLabel");
  if (!versionLabel) return;
  await prisma.$transaction(async (transaction) => {
    const document = await transaction.applicationDocument.create({
      data: {
        applicationId,
        kind: text(formData, "kind") || "Resume",
        versionLabel,
        referenceUrl: optionalText(formData, "referenceUrl"),
        notes: optionalText(formData, "notes"),
        submittedAt: text(formData, "submittedAt") ? dateValue(formData, "submittedAt") : null,
      },
    });
    await transaction.applicationTimelineEvent.create({
      data: {
        applicationId,
        type: `${document.kind} snapshot added`,
        notes: document.versionLabel,
        relatedDocumentId: document.id,
      },
    });
  });
  revalidateApplication(applicationId);
}

export async function addInterviewAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const round = text(formData, "round");
  if (!round) return;
  const scheduledAt = dateValue(formData, "scheduledAt");
  await prisma.$transaction([
    prisma.applicationInterview.create({
      data: {
        applicationId,
        round,
        type: text(formData, "type") || "Video",
        participants: optionalText(formData, "participants"),
        scheduledAt,
        durationMinutes: Number(text(formData, "durationMinutes")) || null,
        preparationNotes: optionalText(formData, "preparationNotes"),
        feedback: optionalText(formData, "feedback"),
        outcome: optionalText(formData, "outcome"),
      },
    }),
    prisma.applicationTimelineEvent.create({
      data: {
        applicationId,
        type: "Interview scheduled",
        notes: round,
        eventAt: scheduledAt,
      },
    }),
  ]);
  revalidateApplication(applicationId);
}

export async function addFollowUpAction(formData: FormData) {
  const applicationId = text(formData, "applicationId");
  const description = text(formData, "description");
  if (!description) return;
  const dueAt = dateValue(formData, "dueAt");
  await prisma.$transaction([
    prisma.applicationFollowUp.create({
      data: {
        applicationId,
        type: text(formData, "type") || "Follow up",
        description,
        dueAt,
      },
    }),
    prisma.applicationTimelineEvent.create({
      data: { applicationId, type: "Follow-up scheduled", notes: description, eventAt: dueAt },
    }),
  ]);
  revalidateApplication(applicationId);
}

export async function completeFollowUpAction(formData: FormData) {
  const followUpId = text(formData, "followUpId");
  const followUp = await prisma.applicationFollowUp.update({
    where: { id: followUpId },
    data: { completedAt: new Date() },
  });
  await prisma.applicationTimelineEvent.create({
    data: {
      applicationId: followUp.applicationId,
      type: "Follow-up completed",
      notes: followUp.description,
    },
  });
  revalidateApplication(followUp.applicationId);
}
