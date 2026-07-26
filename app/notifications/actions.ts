"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";

export async function markNotificationReadAction(formData: FormData) {
  const id = String(formData.get("notificationId") ?? "");
  await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  await prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
