import Link from "next/link";

import { PageHeader } from "@/app/components/PageHeader";
import { SubmitButton } from "@/app/components/SubmitButton";
import { WorkspaceLayout } from "@/app/components/PageLayout";
import { prisma } from "@/lib/db";

import {
  cancelFollowUpAction,
  completeFollowUpAction,
  snoozeFollowUpAction,
} from "../actions";

export const dynamic = "force-dynamic";

function reminderGroup(item: { dueAt: Date; completedAt: Date | null; cancelledAt: Date | null }, now: Date) {
  if (item.completedAt || item.cancelledAt) return "Completed";
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (item.dueAt < today) return "Overdue";
  if (item.dueAt < tomorrow) return "Today";
  return "Upcoming";
}

export default async function ReminderCenterPage() {
  const reminders = await prisma.applicationFollowUp.findMany({
    include: { application: true, contact: true },
    orderBy: { dueAt: "asc" },
  });
  const now = new Date();
  const groups = ["Overdue", "Today", "Upcoming", "Completed"];
  return (
    <WorkspaceLayout className="reminder-center-page">
      <PageHeader title="Follow-ups" subtitle="Complete, snooze, or cancel reminders across every application." />
      <div className="reminder-groups">
        {groups.map((group) => {
          const items = reminders.filter((item) => reminderGroup(item, now) === group);
          return (
            <section key={group} aria-labelledby={`reminder-${group.toLowerCase()}`}>
              <header><h2 id={`reminder-${group.toLowerCase()}`}>{group}</h2><span>{items.length}</span></header>
              <div>
                {items.map((item) => (
                  <article key={item.id}>
                    <div><span>{item.type}</span><h3>{item.description}</h3><p>{item.application.company} · {item.application.role}</p>{item.contact && <small>Contact: {item.contact.name}</small>}</div>
                    <time aria-label={`Due ${item.dueAt.toLocaleString("en-US")}`}>{item.dueAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
                    {!item.completedAt && !item.cancelledAt && <div className="reminder-actions">
                      <form action={completeFollowUpAction}><input type="hidden" name="followUpId" value={item.id} /><SubmitButton className="source-run" pendingLabel="Completing…">Complete</SubmitButton></form>
                      <form action={snoozeFollowUpAction}><input type="hidden" name="followUpId" value={item.id} /><SubmitButton className="source-run" pendingLabel="Snoozing…">Snooze 3 days</SubmitButton></form>
                      <form action={cancelFollowUpAction}><input type="hidden" name="followUpId" value={item.id} /><SubmitButton className="danger-text-button" pendingLabel="Cancelling…">Cancel</SubmitButton></form>
                    </div>}
                    <Link href={`/applications/${item.applicationId}`}>Open Application →</Link>
                  </article>
                ))}
                {!items.length && <p className="reminder-empty">No {group.toLowerCase()} reminders.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </WorkspaceLayout>
  );
}
