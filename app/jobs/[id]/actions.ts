"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { decisionInputSchema, statusToPrisma } from "@/lib/status";

export type DecisionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateJobDecision(
  _previousState: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = decisionInputSchema.safeParse({
    jobId: formData.get("jobId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the decision and try again.",
    };
  }

  try {
    const job = await prisma.job.findUnique({
      where: { id: parsed.data.jobId },
      include: { decisions: { orderBy: { decidedAt: "desc" }, take: 1 } },
    });
    if (!job) return { status: "error", message: "This job could not be found." };

    const previousStatus = job.decisions[0]?.decision ?? job.status;
    const nextStatus = statusToPrisma[parsed.data.status];
    await prisma.$transaction(async (transaction) => {
      await transaction.userDecision.create({
        data: {
          jobId: job.id,
          decision: nextStatus,
          reason: parsed.data.note || null,
        },
      });
      if (previousStatus !== nextStatus) {
        await transaction.activityEvent.create({
          data: {
            jobId: job.id,
            type: "status_changed",
            summary: `Status changed from ${previousStatus.replaceAll("_", " ")} to ${nextStatus.replaceAll("_", " ")}.`,
            metadata: {
              previousStatus,
              nextStatus,
            },
          },
        });
      }
    });
    revalidatePath("/");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/jobs/${job.id}`);
    return { status: "success", message: `Saved as ${parsed.data.status}.` };
  } catch (error) {
    console.error("Failed to save job decision", error);
    return {
      status: "error",
      message: "The decision could not be saved. Please try again.",
    };
  }
}
