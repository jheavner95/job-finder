import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { prisma } from "@/lib/db";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="page notifications-page">
      <PageHeader
        title="Notifications"
        subtitle="Local in-app updates from discovery orchestration. No messages leave this device."
        action={unread ? <form action={markAllNotificationsReadAction}><button className="secondary-button">Mark all read</button></form> : undefined}
      />
      <div className="notification-list">
        {notifications.map((notification) => (
          <article className={notification.readAt ? "notification-card" : "notification-card unread"} key={notification.id}>
            <span aria-hidden="true" />
            <div>
              <p>{notification.type.replaceAll("_", " ")}</p>
              <h2>{notification.title}</h2>
              <p>{notification.message}</p>
              <small>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(notification.createdAt)}</small>
            </div>
            <div className="notification-actions">
              {notification.href && <Link href={notification.href}>View →</Link>}
              {!notification.readAt && <form action={markNotificationReadAction}><input type="hidden" name="notificationId" value={notification.id} /><button type="submit">Mark read</button></form>}
            </div>
          </article>
        ))}
        {!notifications.length && <div className="briefing-empty"><strong>You’re all caught up.</strong><p>Completed searches and source issues will appear here.</p></div>}
      </div>
    </div>
  );
}
