"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { nextRunAt, SCHEDULE_TYPES } from "@/lib/scheduling/schedule";

const savedSearchSchema = z.object({
  connectorId: z.string().min(1),
  titles: z.string().max(2_000),
  locations: z.string().max(2_000),
  remote: z.boolean(),
  hybrid: z.boolean(),
  enabled: z.boolean(),
  scheduleType: z.enum(SCHEDULE_TYPES),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  intervalMinutes: z.coerce.number().int().min(5).max(43_200).optional(),
});

function values(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export async function updateSavedSearchAction(formData: FormData) {
  const parsed = savedSearchSchema.safeParse({
    connectorId: formData.get("connectorId"),
    titles: formData.get("titles"),
    locations: formData.get("locations"),
    remote: formData.get("remote") === "on",
    hybrid: formData.get("hybrid") === "on",
    enabled: formData.get("enabled") === "on",
    scheduleType: formData.get("scheduleType"),
    timeOfDay: String(formData.get("timeOfDay") || "08:00"),
    weekday: Number(formData.get("weekday") || 1),
    intervalMinutes: Number(formData.get("intervalMinutes") || 60),
  });
  if (!parsed.success) redirect("/searches?error=invalid-search");

  const schedule = {
    scheduleType: parsed.data.scheduleType,
    timeOfDay: parsed.data.timeOfDay ?? "08:00",
    weekday: parsed.data.weekday ?? 1,
    intervalMinutes: parsed.data.intervalMinutes ?? 60,
  };
  await prisma.companyConnector.update({
    where: { id: parsed.data.connectorId },
    data: {
      enabled: parsed.data.enabled,
      health: parsed.data.enabled ? "Warning" : "Disabled",
      searchCriteria: {
        titles: values(parsed.data.titles),
        locations: values(parsed.data.locations),
        remote: parsed.data.remote,
        hybrid: parsed.data.hybrid,
        country: "United States",
      },
      schedule: {
        upsert: {
          create: {
            ...schedule,
            nextRunAt: nextRunAt(schedule),
          },
          update: {
            ...schedule,
            nextRunAt: nextRunAt(schedule),
          },
        },
      },
    },
  });
  revalidatePath("/searches");
  revalidatePath("/sources");
  redirect("/searches?saved=1");
}
