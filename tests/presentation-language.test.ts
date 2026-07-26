import { describe, expect, it } from "vitest";

import { greetingForHour } from "../lib/presentation-language";

describe("local greeting language", () => {
  it("covers morning, afternoon, evening, and late-night boundaries", () => {
    expect(greetingForHour(5)).toBe("Good morning.");
    expect(greetingForHour(11)).toBe("Good morning.");
    expect(greetingForHour(12)).toBe("Good afternoon.");
    expect(greetingForHour(16)).toBe("Good afternoon.");
    expect(greetingForHour(17)).toBe("Good evening.");
    expect(greetingForHour(21)).toBe("Good evening.");
    expect(greetingForHour(22)).toBe("Working late?");
    expect(greetingForHour(4)).toBe("Working late?");
  });
});
