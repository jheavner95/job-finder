import { describe, expect, it } from "vitest";

import { nextRunAt, scheduleLabel } from "../lib/scheduling/schedule";

describe("connector scheduling", () => {
  const now = new Date(2026, 6, 26, 9, 30, 0);

  it("supports manual, daily, weekdays, weekly, and custom interval schedules", () => {
    expect(nextRunAt({ scheduleType: "Manual" }, now)).toBeNull();
    expect(nextRunAt({
      scheduleType: "Daily",
      timeOfDay: "10:00",
    }, now)).toEqual(new Date(2026, 6, 26, 10, 0, 0));
    expect(nextRunAt({
      scheduleType: "Weekdays",
      timeOfDay: "08:00",
    }, now)).toEqual(new Date(2026, 6, 27, 8, 0, 0));
    expect(nextRunAt({
      scheduleType: "Weekly",
      weekday: 1,
      timeOfDay: "08:00",
    }, now)).toEqual(new Date(2026, 6, 27, 8, 0, 0));
    expect(nextRunAt({
      scheduleType: "Interval",
      intervalMinutes: 45,
    }, now)).toEqual(new Date(2026, 6, 26, 10, 15, 0));
  });

  it("validates custom intervals and presents readable labels", () => {
    expect(() => nextRunAt({
      scheduleType: "Interval",
      intervalMinutes: 4,
    }, now)).toThrow(/at least 5 minutes/);
    expect(scheduleLabel({
      scheduleType: "Weekly",
      weekday: 2,
      timeOfDay: "09:15",
    })).toBe("Tuesday at 09:15");
    expect(scheduleLabel(null)).toBe("Manual only");
  });
});
