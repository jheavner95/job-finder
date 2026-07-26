export const SCHEDULE_TYPES = [
  "Manual",
  "Daily",
  "Weekdays",
  "Weekly",
  "Interval",
] as const;

export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export type ScheduleInput = {
  scheduleType: ScheduleType;
  timeOfDay?: string | null;
  weekday?: number | null;
  intervalMinutes?: number | null;
};

function atLocalTime(date: Date, timeOfDay: string) {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function nextDayAt(now: Date, timeOfDay: string, allowedDay: (day: number) => boolean) {
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    const scheduled = atLocalTime(candidate, timeOfDay);
    if (allowedDay(scheduled.getDay()) && scheduled.getTime() > now.getTime()) {
      return scheduled;
    }
  }
  throw new Error("Unable to calculate the next scheduled run.");
}

export function nextRunAt(schedule: ScheduleInput, now = new Date()) {
  switch (schedule.scheduleType) {
    case "Manual":
      return null;
    case "Interval": {
      const minutes = schedule.intervalMinutes ?? 0;
      if (!Number.isInteger(minutes) || minutes < 5) {
        throw new Error("Custom intervals must be at least 5 minutes.");
      }
      return new Date(now.getTime() + minutes * 60_000);
    }
    case "Daily":
      return nextDayAt(now, schedule.timeOfDay ?? "08:00", () => true);
    case "Weekdays":
      return nextDayAt(
        now,
        schedule.timeOfDay ?? "08:00",
        (day) => day >= 1 && day <= 5,
      );
    case "Weekly": {
      const weekday = schedule.weekday ?? 1;
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new Error("Weekly schedules require a valid weekday.");
      }
      return nextDayAt(
        now,
        schedule.timeOfDay ?? "08:00",
        (day) => day === weekday,
      );
    }
  }
}

export function scheduleLabel(schedule: {
  scheduleType: string;
  timeOfDay?: string | null;
  weekday?: number | null;
  intervalMinutes?: number | null;
} | null | undefined) {
  if (!schedule || schedule.scheduleType === "Manual") return "Manual only";
  if (schedule.scheduleType === "Interval") {
    return `Every ${schedule.intervalMinutes} minutes`;
  }
  if (schedule.scheduleType === "Weekly") {
    const day = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
      schedule.weekday ?? 1
    ];
    return `${day} at ${schedule.timeOfDay ?? "08:00"}`;
  }
  return `${schedule.scheduleType} at ${schedule.timeOfDay ?? "08:00"}`;
}
