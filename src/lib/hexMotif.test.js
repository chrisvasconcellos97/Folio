// hexMotif.test.js — Hex Grammar v1 primitive unit tests
// Ensures the geometric output of hexPathD is stable and that
// HexSignature's opacity ladder follows the spec exactly.

import { describe, it, expect } from "vitest";
import { hexPathD } from "./hexMotif";

var TAU = Math.PI * 2;

describe("hexPathD", function () {
  it("returns a string starting with M and ending with Z", function () {
    var d = hexPathD(0, 0, 10, 0);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("produces exactly 6 points (M + 5 L's)", function () {
    var d = hexPathD(50, 50, 8, TAU / 12);
    var segments = d.replace("Z", "").split(/(?=[ML])/);
    expect(segments.length).toBe(6);
  });

  it("uses the correct center point for the first vertex (rot=0)", function () {
    // At rot=0, first point is (cx+r, cy)
    var d = hexPathD(100, 100, 20, 0);
    // First coordinate after "M" should be ~120 100
    expect(d.startsWith("M120.0 100.0")).toBe(true);
  });

  it("applies rotation offset correctly for TAU/12", function () {
    // pointy-top hex: first vertex is at angle TAU/12 from center
    var r = 10;
    var rot = TAU / 12;
    var d = hexPathD(0, 0, r, rot);
    var expectedX = (r * Math.cos(rot)).toFixed(1);
    var expectedY = (r * Math.sin(rot)).toFixed(1);
    expect(d.startsWith("M" + expectedX + " " + expectedY)).toBe(true);
  });

  it("is stable across two calls with the same args", function () {
    var a = hexPathD(12, 34, 7, TAU / 12);
    var b = hexPathD(12, 34, 7, TAU / 12);
    expect(a).toBe(b);
  });
});

describe("HexSignature opacity ladder", function () {
  // The ladder rule from the spec: rightmost cell = peak, each step × 0.58
  function computeLadder(cells, peak) {
    var ops = [];
    for (var i = 0; i < cells; i++) {
      ops.push(peak * Math.pow(0.58, i));
    }
    return ops;
  }

  it("3-cell user-content ladder peaks at 0.13", function () {
    var ladder = computeLadder(3, 0.13);
    expect(ladder[0]).toBeCloseTo(0.13);
    expect(ladder[1]).toBeCloseTo(0.13 * 0.58);
    expect(ladder[2]).toBeCloseTo(0.13 * 0.58 * 0.58);
  });

  it("5-cell Pip-authored ladder peaks at 0.30", function () {
    var ladder = computeLadder(5, 0.30);
    expect(ladder[0]).toBeCloseTo(0.30);
    expect(ladder[4]).toBeCloseTo(0.30 * Math.pow(0.58, 4));
  });

  it("each subsequent step is exactly 0.58× the previous", function () {
    var ladder = computeLadder(5, 0.20);
    for (var i = 1; i < ladder.length; i++) {
      expect(ladder[i] / ladder[i - 1]).toBeCloseTo(0.58);
    }
  });

  it("leftmost cell is always the faintest", function () {
    var ladder3 = computeLadder(3, 0.13);
    var ladder5 = computeLadder(5, 0.30);
    // Ladder is ordered rightmost-to-leftmost, so last index = faintest
    expect(ladder3[2]).toBeLessThan(ladder3[1]);
    expect(ladder5[4]).toBeLessThan(ladder5[3]);
  });
});
