import { describe, it, expect } from "vitest";
import { isAwayOn, overlapsAway, currentlyAway, justBackFrom, awayLabel } from "./awayMode";

var PERIODS = [{ start_date: "2026-06-15", end_date: "2026-06-19" }]; // Mon–Fri

describe("awayMode", () => {
  describe("isAwayOn", () => {
    it("is true inside the window (inclusive of both ends), false outside", () => {
      expect(isAwayOn("2026-06-15", PERIODS)).toBe(true);  // start
      expect(isAwayOn("2026-06-17", PERIODS)).toBe(true);  // middle
      expect(isAwayOn("2026-06-19", PERIODS)).toBe(true);  // end
      expect(isAwayOn("2026-06-14", PERIODS)).toBe(false); // day before
      expect(isAwayOn("2026-06-20", PERIODS)).toBe(false); // day after
    });
    it("is false with no periods / bad input", () => {
      expect(isAwayOn("2026-06-17", [])).toBe(false);
      expect(isAwayOn(null, PERIODS)).toBe(false);
    });
  });

  describe("overlapsAway", () => {
    it("detects any overlap of a range with the window", () => {
      expect(overlapsAway("2026-06-18", "2026-06-25", PERIODS)).toBe(true);  // starts inside
      expect(overlapsAway("2026-06-10", "2026-06-16", PERIODS)).toBe(true);  // ends inside
      expect(overlapsAway("2026-06-10", "2026-06-30", PERIODS)).toBe(true);  // spans it
      expect(overlapsAway("2026-06-20", "2026-06-25", PERIODS)).toBe(false); // after
    });
    it("treats a single date as a point", () => {
      expect(overlapsAway("2026-06-17", null, PERIODS)).toBe(true);
      expect(overlapsAway(null, "2026-06-25", PERIODS)).toBe(false);
    });
  });

  describe("currentlyAway", () => {
    it("returns the active period when now is inside, else null", () => {
      expect(currentlyAway(PERIODS, new Date(2026, 5, 17, 12))).toBe(PERIODS[0]);
      expect(currentlyAway(PERIODS, new Date(2026, 5, 25, 12))).toBe(null);
    });
  });

  describe("justBackFrom", () => {
    it("returns the period if it ended within the window, else null", () => {
      // Mon Jun 22 — 3 days after the Fri Jun 19 end → just back.
      expect(justBackFrom(PERIODS, new Date(2026, 5, 22, 9), 3)).toBe(PERIODS[0]);
      // Jun 25 — 6 days after → outside a 3-day window.
      expect(justBackFrom(PERIODS, new Date(2026, 5, 25, 9), 3)).toBe(null);
      // Still away → not "back" yet.
      expect(justBackFrom(PERIODS, new Date(2026, 5, 17, 9), 3)).toBe(null);
    });
    it("picks the most recently-ended when several qualify", () => {
      var two = [
        { start_date: "2026-06-01", end_date: "2026-06-05" },
        { start_date: "2026-06-15", end_date: "2026-06-19" },
      ];
      expect(justBackFrom(two, new Date(2026, 5, 20, 9), 7)).toBe(two[1]);
    });
  });

  describe("awayLabel", () => {
    it("compacts same-month ranges and spans cross-month", () => {
      expect(awayLabel({ start_date: "2026-06-15", end_date: "2026-06-19" })).toBe("Jun 15–19");
      expect(awayLabel({ start_date: "2026-06-28", end_date: "2026-07-02" })).toBe("Jun 28 – Jul 2");
    });
  });
});
