import { describe, it, expect } from "vitest";
import {
  toLocalDate, fmtShort, fmtMedium, fmtLong, fmtRelative,
  todayISO, isOverdue, isToday,
} from "./dateUtils";

describe("dateUtils", () => {
  describe("toLocalDate", () => {
    it("returns null for empty/invalid input", () => {
      expect(toLocalDate(null)).toBe(null);
      expect(toLocalDate("")).toBe(null);
      expect(toLocalDate("not-a-date")).toBe(null);
    });
    it("anchors a date-only string to LOCAL midnight (not UTC)", () => {
      // The ET-safety property: "2026-06-04" must read as June 4 locally,
      // never roll back to June 3 the way `new Date("2026-06-04")` (UTC) does.
      var d = toLocalDate("2026-06-04");
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(5); // June (0-indexed)
      expect(d.getDate()).toBe(4);
      expect(d.getHours()).toBe(0);
    });
    it("passes a Date object through", () => {
      var src = new Date(2026, 5, 4, 9, 30);
      expect(toLocalDate(src)).toBe(src);
    });
  });

  describe("fmtShort / fmtMedium / fmtLong", () => {
    it("formats a date-only string ET-safe (no day-early drift)", () => {
      expect(fmtShort("2026-06-04")).toBe("Jun 4");
      expect(fmtMedium("2026-06-04")).toBe("Jun 4, 2026");
      expect(fmtLong("2026-06-04")).toBe("June 4, 2026");
    });
    it("formats a Date object", () => {
      var d = new Date(2026, 11, 25); // Dec 25 2026 local
      expect(fmtShort(d)).toBe("Dec 25");
      expect(fmtMedium(d)).toBe("Dec 25, 2026");
      expect(fmtLong(d)).toBe("December 25, 2026");
    });
    it("returns '' for empty input", () => {
      expect(fmtShort(null)).toBe("");
      expect(fmtMedium("")).toBe("");
      expect(fmtLong(undefined)).toBe("");
    });
  });

  describe("fmtRelative", () => {
    it("reads 'just now' for the present", () => {
      expect(fmtRelative(new Date())).toBe("just now");
    });
    it("reads minutes / hours / days ago", () => {
      var now = Date.now();
      expect(fmtRelative(new Date(now - 5 * 60000))).toBe("5m ago");
      expect(fmtRelative(new Date(now - 3 * 3600000))).toBe("3h ago");
      expect(fmtRelative(new Date(now - 2 * 86400000))).toBe("2d ago");
      expect(fmtRelative(new Date(now - 3 * 7 * 86400000))).toBe("3w ago");
    });
    it("falls back to a short date past ~5 weeks", () => {
      var old = new Date(2020, 0, 15);
      expect(fmtRelative(old)).toBe("Jan 15");
    });
    it("returns '' for empty input", () => {
      expect(fmtRelative(null)).toBe("");
    });
  });

  describe("todayISO", () => {
    it("returns a LOCAL YYYY-MM-DD (not UTC slice)", () => {
      // Late-evening ET would push toISOString().slice(0,10) to tomorrow;
      // todayISO must reflect the local calendar day.
      var d = new Date(2026, 5, 4, 23, 30); // Jun 4, 11:30pm local
      expect(todayISO(d)).toBe("2026-06-04");
    });
    it("zero-pads month and day", () => {
      expect(todayISO(new Date(2026, 0, 3))).toBe("2026-01-03");
    });
  });

  describe("isOverdue", () => {
    it("is true for a date before today's local day", () => {
      expect(isOverdue("2026-06-03", "2026-06-04")).toBe(true);
    });
    it("is false for today and the future", () => {
      expect(isOverdue("2026-06-04", "2026-06-04")).toBe(false);
      expect(isOverdue("2026-06-05", "2026-06-04")).toBe(false);
    });
    it("is false for empty input", () => {
      expect(isOverdue(null, "2026-06-04")).toBe(false);
    });
  });

  describe("isToday", () => {
    it("matches the same calendar day (ET-safe)", () => {
      expect(isToday("2026-06-04", "2026-06-04")).toBe(true);
      expect(isToday("2026-06-03", "2026-06-04")).toBe(false);
    });
    it("is false for empty input", () => {
      expect(isToday(null, "2026-06-04")).toBe(false);
    });
  });
});
