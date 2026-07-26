import type { Prisma, PrismaClient } from "@prisma/client";

export type NotificationInput = {
  type: "discovery_complete" | "connector_failure" | "review_required";
  title: string;
  message: string;
  href?: string;
  metadata?: Prisma.InputJsonValue;
};

export interface NotificationPublisher {
  publish(notification: NotificationInput): Promise<void>;
}

export class InAppNotificationPublisher implements NotificationPublisher {
  constructor(private readonly database: PrismaClient) {}

  async publish(notification: NotificationInput) {
    await this.database.notification.create({ data: notification });
  }
}
