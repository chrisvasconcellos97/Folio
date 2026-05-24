import { describe, it, expect } from "vitest";
import { fmtRevenue, fmtPct, momPct } from "./metricsUtils";

describe("fmtRevenue", function () {
  it("formats thousands", function () {
    expect(fmtRevenue(2000)).toBe("$2K");
  });
  it("formats millions", function () {
    expect(fmtRevenue(2500000)).toBe("$2.5M");
  });
  it("returns dash for null", function () {
    expect(fmtRevenue(null)).toBe("—");
  });
});

describe("fmtPct", function () {
  it("formats positive pct with up arrow", function () {
    var result = fmtPct(12);
    expect(result).toContain("12");
    expect(result).toContain("↑");
  });
  it("formats negative pct with down arrow", function () {
    var result = fmtPct(-5);
    expect(result).toContain("5");
    expect(result).toContain("↓");
  });
  it("returns null for null", function () {
    expect(fmtPct(null)).toBeNull();
  });
});

describe("momPct", function () {
  it("calculates month-over-month percentage", function () {
    var history = [
      { account_id: "a1", month: 4, year: 2026, revenue: 1000 },
      { account_id: "a1", month: 5, year: 2026, revenue: 1200 },
    ];
    var result = momPct(history, "a1", "revenue");
    expect(result).toBeCloseTo(20, 0);
  });
  it("returns null when insufficient data", function () {
    var result = momPct([], "a1", "revenue");
    expect(result).toBeNull();
  });
});
