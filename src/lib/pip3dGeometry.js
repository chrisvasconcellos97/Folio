// ─── Pip 3D "Bold Hex" geometry — pure math, no DOM, no React ────────────────
// This module is the single source of truth for Pip's locked 3D parameters.
// The component (PipOrb3D) renders what this returns; it does not own geometry.
//
// LOCKED DESIGN: All parameters below are frozen by Chris (June 2026).
// Changing ANY value in PIP_SPEC is a design regression — the CI test
// (pip3dGeometry.test.js) will fail loudly if anything drifts.
// ─────────────────────────────────────────────────────────────────────────────

var TAU = Math.PI * 2;

// ── Frozen spec ──────────────────────────────────────────────────────────────
export var PIP_SPEC = Object.freeze({
  // Ring parameters
  ring: Object.freeze({
    R:     84,
    rt:    18,
    nu:    16,
    nv:    4,
    tiltX: 0.40,
    tiltY: -0.48,
    spin:  0.45,
    sw:    1.6,
    warp:  16,
    wob:   6,
    fill:  false,
    // ring swell: R*(0.97+0.05*breath), tube: rt*(0.92+0.12*breath)
    // radius waver: 1+0.055*sin(2u-0.33t)
    // twist: warp*sin(2u+0.9-0.41t)+wob*sin(3u+0.27t)
  }),
  // Sphere parameters — head (Pip's "brain") sits above, tail below
  sphereHead: Object.freeze({
    cx:      0,
    cy:      -16,
    r:       16,
    n:       18,
    opacity: 1,
    spin:    0.3,
    tilt:    0.35,
    phase:   0.3,
  }),
  sphereTail: Object.freeze({
    cx:      0,
    cy:      18,
    r:       11.2,
    n:       10,
    opacity: 0.42,
    spin:    -0.26,
    tilt:    0.4,
    phase:   1.7,
  }),
  // Perspective focal lengths
  FP: 480,   // ring perspective focal (screen units)
  FS: 5,     // sphere perspective focal (unit-sphere units)
  // ViewBox
  viewBox: "-118 -118 236 236",
  // Breath
  breathPeriod: 2.4,   // seconds
  // breath = 0.5 - 0.5*cos(2πt/2.4)
  // hex scale bs = 0.55 + 0.56*breath  (shared by ALL hexes: ring + spheres)
  // sphere core glow opacity: 0.55 + 0.45*breath
  // outer glow opacity:       0.50 + 0.45*breath
  // sphere group scale:       1 + 0.08*breath
  // sphere radius:            r*(0.97 + 0.06*breath)
  // Depth bucket thresholds (z normalized)
  bucketThresholds: Object.freeze([-0.4, 0, 0.4]),
  // bucket: 0=deep-back, 1=mid-back, 2=mid-front, 3=bright-front
  bucketOpacities:   Object.freeze([0.16, 0.34, 0.66, 0.95]),
  bucketSwMult:      Object.freeze([0.8,  0.9,  1.05, 1.25]),
  // Sphere core radial gradient
  coreGrad: Object.freeze({
    cx: "42%", cy: "36%", r: "70%",
    stops: Object.freeze([
      Object.freeze({ offset: "0%",   opacity: 0.85 }),   // accent-hi
      Object.freeze({ offset: "45%",  opacity: 0.38 }),   // accent
      Object.freeze({ offset: "100%", opacity: 0    }),   // accent
    ]),
  }),
  // Outer ambient glow radial gradient (r=100 in viewBox space)
  outerGlowGrad: Object.freeze({
    r: 100,
    stops: Object.freeze([
      Object.freeze({ offset: "0%",   opacity: 0.26 }),
      Object.freeze({ offset: "55%",  opacity: 0.09 }),
      Object.freeze({ offset: "100%", opacity: 0    }),
    ]),
  }),
  // State → timeScale mapping
  stateTimeScale: Object.freeze({
    idle:     1,
    thinking: 2.2,
    alert:    1.6,
    speaking: 1,
  }),
  // Speaking outer-glow oscillation
  speakingGlowMin: 0.55,
  speakingGlowMax: 1.0,
  speakingGlowPeriod: 0.42,
});

// ── Pure rotation helpers ─────────────────────────────────────────────────────
// rotXY: rotate around X then Y axes (used by ring torus surface)
function rotXY(p, ca, sa, cb, sb) {
  var x = p[0], y = p[1] * ca - p[2] * sa, z = p[1] * sa + p[2] * ca;
  return [x * cb + z * sb, y, -x * sb + z * cb];
}

// rotYX: rotate around Y then X axes (used by sphere hex placement)
function rotYX(v, ay, ax) {
  var x = v[0], y = v[1], z = v[2];
  var cy = Math.cos(ay), sy = Math.sin(ay);
  var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  var cx2 = Math.cos(ax), sx2 = Math.sin(ax);
  return [x1, y * cx2 - z1 * sx2, y * sx2 + z1 * cx2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function vnorm(a) {
  var l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
}

// ── Golden-spiral sphere point distribution ──────────────────────────────────
// Ported verbatim from the mockup's fibSphere()
export function fibSphere(n) {
  var pts = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < n; i++) {
    var y = 1 - (i / (n - 1)) * 2;
    var rad = Math.sqrt(Math.max(0, 1 - y * y));
    var th = ga * i;
    pts.push([Math.cos(th) * rad, y, Math.sin(th) * rad]);
  }
  return pts;
}

// ── Depth bucket assignment ───────────────────────────────────────────────────
function zbucket(z) {
  var t = PIP_SPEC.bucketThresholds;
  if (z < t[0]) return 0;
  if (z < t[1]) return 1;
  if (z < t[2]) return 2;
  return 3;
}

// ── Torus surface with organic twist ─────────────────────────────────────────
// Ported verbatim from the mockup's surf() inside makeHexRing
function surf(u, v, R, rt, t, warp, wob) {
  var Ru = R * (1 + 0.055 * Math.sin(2 * u - t * 0.33));
  var zw = warp * Math.sin(2 * u + 0.9 - t * 0.41) + wob * Math.sin(3 * u + t * 0.27);
  var cw = Ru + rt * Math.cos(v);
  return [cw * Math.cos(u), cw * Math.sin(u), rt * Math.sin(v) + zw];
}

// ── Build per-frame path data for one ring ────────────────────────────────────
function buildRingPaths(t, breath, bs) {
  var cfg = PIP_SPEC.ring;
  var R  = cfg.R  * (0.97 + 0.05 * breath);
  var rt = cfg.rt * (0.92 + 0.12 * breath);
  var spin = t * cfg.spin;
  var zn = cfg.R * 0.72 + cfg.rt + cfg.warp * 0.6;
  var ca = Math.cos(cfg.tiltX), sa = Math.sin(cfg.tiltX);
  var cb = Math.cos(cfg.tiltY), sb = Math.sin(cfg.tiltY);
  var du = TAU / cfg.nu, dv = TAU / cfg.nv;
  var hru = du * 0.5 * 0.95, hrv = dv * 0.5 * 0.85;
  var d = ["", "", "", ""];
  for (var j = 0; j < cfg.nv; j++) {
    var vC = (j + 0.5) * dv;
    var uOff = (j % 2) * 0.5 * du;
    for (var i = 0; i < cfg.nu; i++) {
      var uC = i * du + uOff + spin;
      var pc = rotXY(surf(uC, vC, R, rt, t, cfg.warp, cfg.wob), ca, sa, cb, sb);
      var z = pc[2] / zn;
      var b = zbucket(z);
      var seg = "";
      for (var k = 0; k < 6; k++) {
        var ang = k * TAU / 6 + TAU / 12;
        var u2 = uC + hru * Math.cos(ang) * bs;
        var v2 = vC + hrv * Math.sin(ang) * bs;
        var pt = rotXY(surf(u2, v2, R, rt, t, cfg.warp, cfg.wob), ca, sa, cb, sb);
        var pf = PIP_SPEC.FP / (PIP_SPEC.FP - pt[2]);
        seg += (k === 0 ? "M" : "L") + (pt[0] * pf).toFixed(1) + " " + (-pt[1] * pf).toFixed(1);
      }
      d[b] += seg + "Z";
    }
  }
  return d;
}

// ── Build per-frame path data for one sphere ──────────────────────────────────
function buildSpherePaths(t, breath, bs, sphSpec, fibPts) {
  var r = sphSpec.r * (0.97 + 0.06 * breath);
  var ay = sphSpec.phase + t * sphSpec.spin;
  var ax = sphSpec.tilt;
  var hscale = 1.9 / Math.sqrt(sphSpec.n);
  var d = ["", "", "", ""];
  for (var i = 0; i < fibPts.length; i++) {
    var p = rotYX(fibPts[i], ay, ax);
    var up = Math.abs(p[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    var e1 = vnorm(cross(up, p)), e2 = cross(p, e1);
    var b = zbucket(p[2]);
    var seg = "";
    for (var k = 0; k < 6; k++) {
      var a = k * TAU / 6;
      var c = Math.cos(a) * hscale * bs, s = Math.sin(a) * hscale * bs;
      var q = [p[0] + e1[0] * c + e2[0] * s, p[1] + e1[1] * c + e2[1] * s, p[2] + e1[2] * c + e2[2] * s];
      var pf = PIP_SPEC.FS / (PIP_SPEC.FS - q[2]);
      seg += (k === 0 ? "M" : "L") +
        (sphSpec.cx + q[0] * pf * r).toFixed(1) + " " +
        (sphSpec.cy - q[1] * pf * r).toFixed(1);
    }
    d[b] += seg + "Z";
  }
  return d;
}

// ── Pre-compute static fiber sphere point sets ────────────────────────────────
var _headPts = null, _tailPts = null;
function getHeadPts() { if (!_headPts) _headPts = fibSphere(PIP_SPEC.sphereHead.n); return _headPts; }
function getTailPts() { if (!_tailPts) _tailPts = fibSphere(PIP_SPEC.sphereTail.n); return _tailPts; }

// ── Main entry point: build one frame ────────────────────────────────────────
// Returns a plain serializable object with all per-frame data.
// The renderer updates SVG attributes from this without touching geometry logic.
export function buildPipFrame(t) {
  var breath = 0.5 - 0.5 * Math.cos(TAU * t / PIP_SPEC.breathPeriod);
  var bs = 0.55 + 0.56 * breath;   // ONE hex scale for every hexagon in the figure
  var sphereScale = 1 + 0.08 * breath;
  var coreOpacity = 0.55 + 0.45 * breath;
  var outerGlowOpacity = 0.5 + 0.45 * breath;

  return {
    breath: breath,
    bs: bs,
    sphereScale: sphereScale,
    coreOpacity: coreOpacity,
    outerGlowOpacity: outerGlowOpacity,
    ringPaths:   buildRingPaths(t, breath, bs),
    headPaths:   buildSpherePaths(t, breath, bs, PIP_SPEC.sphereHead, getHeadPts()),
    headCoreR:   (PIP_SPEC.sphereHead.r * (0.97 + 0.06 * breath) * 0.92).toFixed(1),
    tailPaths:   buildSpherePaths(t, breath, bs, PIP_SPEC.sphereTail, getTailPts()),
    tailCoreR:   (PIP_SPEC.sphereTail.r * (0.97 + 0.06 * breath) * 0.92).toFixed(1),
  };
}
