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

describe("getNextOccurrence — monthly day-of-month overflow", function () {
  it("clamps 'monthly on the 31st' to the last day of a short month (Feb)", function () {
    // From early Feb 2026 (28 days), the 31st must clamp to Feb 28, not roll to March.
    var cadence = { frequency: "monthly", day_of_month: 31 };
    var next = getNextOccurrence(cadence, new Date("2026-02-01T00:00:00"));
    expect(next.getMonth()).toBe(1);   // February (0-indexed)
    expect(next.getDate()).toBe(28);   // clamped, not Mar 3
  });
  it("clamps the 31st to 30 for a 30-day month (April)", function () {
    var cadence = { frequency: "monthly", day_of_month: 31 };
    var next = getNextOccurrence(cadence, new Date("2026-04-01T00:00:00"));
    expect(next.getMonth()).toBe(3);   // April
    expect(next.getDate()).toBe(30);
  });
  it("keeps the exact day for a month that has it", function () {
    var cadence = { frequency: "monthly", day_of_month: 15 };
    var next = getNextOccurrence(cadence, new Date("2026-03-01T00:00:00"));
    expect(next.getMonth()).toBe(2);
    expect(next.getDate()).toBe(15);
  });
  it("getOccurrencesInRange never overflows a month boundary for day 31", function () {
    var cadence = { frequency: "monthly", day_of_month: 31 };
    var results = getOccurrencesInRange(cadence, new Date("2026-01-01T00:00:00"), new Date("2026-04-30T23:59:59"));
    // Each occurrence must fall in a distinct month, none spilling to day 1-3 of the next.
    results.forEach(function (d) {
      expect(d.getDate()).toBeGreaterThanOrEqual(28);
    });
  });
});
