import { JobStatus as PrismaJobStatus } from "@prisma/client";
import { z } from "zod";
import type { JobStatus } from "./types";

export const jobStatusSchema = z.enum([
  "New",
  "Strong Match",
  "Possible",
  "Rejected",
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Closed",
]);

export const decisionInputSchema = z.object({
  jobId: z.string().cuid(),
  status: jobStatusSchema,
  note: z.string().trim().max(2000, "Notes must be 2,000 characters or fewer.").optional(),
});

export const statusToPrisma: Record<JobStatus, PrismaJobStatus> = {
  New: PrismaJobStatus.NEW,
  "Strong Match": PrismaJobStatus.STRONG_MATCH,
  Possible: PrismaJobStatus.POSSIBLE,
  Rejected: PrismaJobStatus.REJECTED,
  Saved: PrismaJobStatus.SAVED,
  Applied: PrismaJobStatus.APPLIED,
  Interviewing: PrismaJobStatus.INTERVIEWING,
  Offer: PrismaJobStatus.OFFER,
  Closed: PrismaJobStatus.CLOSED,
};

export const statusFromPrisma: Record<PrismaJobStatus, JobStatus> = {
  NEW: "New",
  STRONG_MATCH: "Strong Match",
  POSSIBLE: "Possible",
  REJECTED: "Rejected",
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  CLOSED: "Closed",
};
