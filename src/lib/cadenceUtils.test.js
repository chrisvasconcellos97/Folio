import { describe, it, expect } from "vitest";
import { getFrequencyLabel, getNextOccurrence, getOccurrencesInRange } from "./cadenceUtils";

describe("getFrequencyLabel", function () {
  it("weekly on Monday", function () {
    expect(getFrequencyLabel({ frequency: "weekly", day_of_week: 1 })).toBe("Every Monday");
  });
  it("biweekly on Friday", function () {
    expect(getFrequencyLabel({ frequency: "biweekly", day_of_week: 5 })).toBe("Every other Friday");
  });
  it("monthly on 15th", function () {
    expect(getFrequencyLabel({ frequency: "monthly", day_of_month: 15 })).toBe("Monthly · 15th");
  });
});

describe("getNextOccurrence", function () {
  it("returns next Monday from a Wednesday", function () {
    var wednesday = new Date("2026-05-27"); // Wednesday
    var cadence = { frequency: "weekly", day_of_week: 1 }; // Monday
    var next = getNextOccurrence(cadence, wednesday);
    expect(next.getDay()).toBe(1);
    expect(next > wednesday).toBe(true);
  });
  it("returns null for unknown frequency", function () {
    var result = getNextOccurrence({ frequency: "unknown" }, new Date());
    expect(result).toBeNull();
  });
});

describe("getOccurrencesInRange", function () {
  it("finds weekly occurrences in a month", function () {
    var cadence = { frequency: "weekly", day_of_week: 1 }; // Mondays
    var start = new Date("2026-05-01");
    var end   = new Date("2026-05-31");
    var results = getOccurrencesInRange(cadence, start, end);
    expect(results.length).toBe(4); // May 2026 has 4 Mondays: 4,11,18,25
    results.forEach(function (d) { expect(d.getDay()).toBe(1); });
  });
  it("returns empty array when no occurrences in range", function () {
    var cadence = { frequency: "weekly", day_of_week: 1 };
    var start = new Date("2026-05-05"); // Tuesday
    var end   = new Date("2026-05-06"); // Wednesday
    var results = getOccurrencesInRange(cadence, start, end);
    expect(results.length).toBe(0);
  });
});
