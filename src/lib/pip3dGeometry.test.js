// ─── pip3dGeometry.test.js — Drift lock for Pip's frozen 3D specification ────
//
// These tests are a DESIGN LOCK, not just unit tests.
// If any assertion here fails, Pip's locked geometry changed.
// That requires Chris's explicit approval — see CLAUDE.md Pip Visual Spec Rule
// (item 44, "Bold Hex" variant, frozen June 2026).
//
// HOW TO UPDATE (only with approval):
//   1. Change the parameter in PIP_SPEC in pip3dGeometry.js
//   2. Re-run the hash test to get the new expected hash
//   3. Update the hash constant below
//   4. Note the change in docs/upgrades.md + get Chris's sign-off
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { PIP_SPEC, buildPipFrame, fibSphere } from "./pip3dGeometry.js";

// ── Simple djb2 hash for determinism check ───────────────────────────────────
function djb2(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

// ── Expected output hash at t=1.1 ────────────────────────────────────────────
// Computed once from the locked geometry. If this changes, the design drifted.
var EXPECTED_HASH_T11 = 2682213558;
var EXPECTED_HASH_T0  = 910385610;

// ─────────────────────────────────────────────────────────────────────────────

describe("PIP_SPEC — locked parameters", function () {
  it("spec is frozen (immutable)", function () {
    expect(Object.isFrozen(PIP_SPEC)).toBe(true);
    expect(Object.isFrozen(PIP_SPEC.ring)).toBe(true);
    expect(Object.isFrozen(PIP_SPEC.sphereHead)).toBe(true);
    expect(Object.isFrozen(PIP_SPEC.sphereTail)).toBe(true);
  });

  // Ring parameters
  it("ring R = 84", function () { expect(PIP_SPEC.ring.R).toBe(84); });
  it("ring rt = 18", function () { expect(PIP_SPEC.ring.rt).toBe(18); });
  it("ring nu = 16", function () { expect(PIP_SPEC.ring.nu).toBe(16); });
  it("ring nv = 4",  function () { expect(PIP_SPEC.ring.nv).toBe(4); });
  it("ring tiltX = 0.40", function () { expect(PIP_SPEC.ring.tiltX).toBe(0.40); });
  it("ring tiltY = -0.48", function () { expect(PIP_SPEC.ring.tiltY).toBe(-0.48); });
  it("ring spin = 0.45 rad/s", function () { expect(PIP_SPEC.ring.spin).toBe(0.45); });
  it("ring sw (stroke-width) = 1.6", function () { expect(PIP_SPEC.ring.sw).toBe(1.6); });
  it("ring warp = 16", function () { expect(PIP_SPEC.ring.warp).toBe(16); });
  it("ring wob = 6", function () { expect(PIP_SPEC.ring.wob).toBe(6); });
  it("ring fill = false", function () { expect(PIP_SPEC.ring.fill).toBe(false); });

  // Sphere — head
  it("sphereHead n = 18", function () { expect(PIP_SPEC.sphereHead.n).toBe(18); });
  it("sphereHead r = 16", function () { expect(PIP_SPEC.sphereHead.r).toBe(16); });
  it("sphereHead cy = -16 (above center)", function () { expect(PIP_SPEC.sphereHead.cy).toBe(-16); });
  it("sphereHead opacity = 1", function () { expect(PIP_SPEC.sphereHead.opacity).toBe(1); });
  it("sphereHead spin = 0.3", function () { expect(PIP_SPEC.sphereHead.spin).toBe(0.3); });
  it("sphereHead tilt = 0.35", function () { expect(PIP_SPEC.sphereHead.tilt).toBe(0.35); });
  it("sphereHead phase = 0.3", function () { expect(PIP_SPEC.sphereHead.phase).toBe(0.3); });

  // Sphere — tail
  it("sphereTail n = 10", function () { expect(PIP_SPEC.sphereTail.n).toBe(10); });
  it("sphereTail r = 11.2", function () { expect(PIP_SPEC.sphereTail.r).toBe(11.2); });
  it("sphereTail cy = 18 (below center)", function () { expect(PIP_SPEC.sphereTail.cy).toBe(18); });
  it("sphereTail opacity = 0.42 (canonical Pip tail opacity)", function () { expect(PIP_SPEC.sphereTail.opacity).toBe(0.42); });
  it("sphereTail spin = -0.26 (counter-spin)", function () { expect(PIP_SPEC.sphereTail.spin).toBe(-0.26); });
  it("sphereTail tilt = 0.4", function () { expect(PIP_SPEC.sphereTail.tilt).toBe(0.4); });
  it("sphereTail phase = 1.7", function () { expect(PIP_SPEC.sphereTail.phase).toBe(1.7); });

  // Perspective
  it("ring focal length FP = 480", function () { expect(PIP_SPEC.FP).toBe(480); });
  it("sphere focal length FS = 5", function () { expect(PIP_SPEC.FS).toBe(5); });

  // Breath
  it("breath period = 2.4s", function () { expect(PIP_SPEC.breathPeriod).toBe(2.4); });

  // ViewBox
  it("viewBox = '-118 -118 236 236'", function () { expect(PIP_SPEC.viewBox).toBe("-118 -118 236 236"); });

  // Bucket counts
  it("4 depth buckets (thresholds length = 3)", function () { expect(PIP_SPEC.bucketThresholds.length).toBe(3); });
  it("4 bucket opacities", function () { expect(PIP_SPEC.bucketOpacities.length).toBe(4); });
  it("bucket opacities are [0.16, 0.34, 0.66, 0.95]", function () {
    expect(Array.from(PIP_SPEC.bucketOpacities)).toEqual([0.16, 0.34, 0.66, 0.95]);
  });
  it("bucket sw multipliers are [0.8, 0.9, 1.05, 1.25]", function () {
    expect(Array.from(PIP_SPEC.bucketSwMult)).toEqual([0.8, 0.9, 1.05, 1.25]);
  });

  // State time scales
  it("idle timeScale = 1", function () { expect(PIP_SPEC.stateTimeScale.idle).toBe(1); });
  it("thinking timeScale = 2.2", function () { expect(PIP_SPEC.stateTimeScale.thinking).toBe(2.2); });
  it("alert timeScale = 1.6", function () { expect(PIP_SPEC.stateTimeScale.alert).toBe(1.6); });
  it("speaking timeScale = 1", function () { expect(PIP_SPEC.stateTimeScale.speaking).toBe(1); });
  it("speaking glow period = 0.42s", function () { expect(PIP_SPEC.speakingGlowPeriod).toBe(0.42); });
});

describe("fibSphere — point distribution", function () {
  it("returns n points", function () {
    var pts = fibSphere(18);
    expect(pts.length).toBe(18);
  });
  it("all points approximately on unit sphere", function () {
    var pts = fibSphere(18);
    pts.forEach(function (p) {
      var len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      expect(len).toBeCloseTo(1, 4);
    });
  });
});

describe("buildPipFrame — output shape", function () {
  it("returns all required fields at t=0", function () {
    var f = buildPipFrame(0);
    expect(typeof f.breath).toBe("number");
    expect(typeof f.bs).toBe("number");
    expect(typeof f.sphereScale).toBe("number");
    expect(typeof f.coreOpacity).toBe("number");
    expect(typeof f.outerGlowOpacity).toBe("number");
    expect(Array.isArray(f.ringPaths)).toBe(true);
    expect(f.ringPaths.length).toBe(4);
    expect(Array.isArray(f.headPaths)).toBe(true);
    expect(f.headPaths.length).toBe(4);
    expect(Array.isArray(f.tailPaths)).toBe(true);
    expect(f.tailPaths.length).toBe(4);
    expect(typeof f.headCoreR).toBe("string");
    expect(typeof f.tailCoreR).toBe("string");
  });

  it("breath=0 at t=0 (cosine starts at 1, so 0.5-0.5=0)", function () {
    var f = buildPipFrame(0);
    expect(f.breath).toBeCloseTo(0, 8);
  });

  it("bs = 0.55 when breath=0 (hex scale at rest)", function () {
    var f = buildPipFrame(0);
    expect(f.bs).toBeCloseTo(0.55, 6);
  });

  it("sphereScale = 1 when breath=0", function () {
    var f = buildPipFrame(0);
    expect(f.sphereScale).toBeCloseTo(1, 6);
  });

  it("coreOpacity = 0.55 when breath=0", function () {
    var f = buildPipFrame(0);
    expect(f.coreOpacity).toBeCloseTo(0.55, 6);
  });

  it("outerGlowOpacity = 0.5 when breath=0", function () {
    var f = buildPipFrame(0);
    expect(f.outerGlowOpacity).toBeCloseTo(0.5, 6);
  });

  it("all path strings contain M and Z (valid path data)", function () {
    var f = buildPipFrame(1.1);
    f.ringPaths.forEach(function (d, i) {
      if (d && d !== "M0 0") {
        expect(d).toContain("M");
        expect(d).toContain("Z");
      }
    });
  });
});

describe("buildPipFrame — determinism lock", function () {
  // If this test fails, Pip's locked geometry changed.
  // That requires Chris's explicit approval — see CLAUDE.md Pip Visual Spec Rule.
  it("t=1.1 output hash matches locked value", function () {
    var f = buildPipFrame(1.1);
    var hash = djb2(JSON.stringify(f));
    expect(hash).toBe(EXPECTED_HASH_T11);
  });

  it("t=0 output hash matches locked value", function () {
    var f = buildPipFrame(0);
    var hash = djb2(JSON.stringify(f));
    expect(hash).toBe(EXPECTED_HASH_T0);
  });

  it("two calls at same t produce identical output (deterministic)", function () {
    var a = JSON.stringify(buildPipFrame(1.1));
    var b = JSON.stringify(buildPipFrame(1.1));
    expect(a).toBe(b);
  });

  it("two calls at same t produce identical output (deterministic) at t=2.99", function () {
    var a = JSON.stringify(buildPipFrame(2.99));
    var b = JSON.stringify(buildPipFrame(2.99));
    expect(a).toBe(b);
  });
});
