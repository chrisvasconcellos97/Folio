// Unified Folios Mark — teal-tinted disc + per-tab glyph + per-tab animation
// (page-size only). One shared rAF loop animates every mounted page-size
// mark via a per-tab registration so we don't burn timers or rerun
// fingerprinting at runtime. Rail/compact sizes (22/32) stay static so the
// chrome stays readable at small sizes.
//
// Props:
//   tab    — 'accounts' | 'departments' | 'partners' | 'meetings' | 'pipeline'
//          | 'cadence'  | 'gauge'       | 'team'     | 'route'    | 'settings'
//          | 'pip' (brand)
//          (legacy aliases 'routes', 'workspaces', 'diagnostics' tolerated)
//   size   — 22 | 32 | 52 | 72 | 120  (default 22)
//   active — drives the rail "you are here" pulse only (light theme).
//
// See README §1 in the design handoff for the spec. Tokens (`--c-folio*`)
// live in index.html.
//
// All glyphs use viewBox -10 -10 20 20 and `currentColor` for stroke/fill,
// so the glyph color is themed via `--c-folio-deep`.

import { memo, useEffect, useRef } from "react";

var SVG_NS = "http://www.w3.org/2000/svg";
var TAU = Math.PI * 2;

// ── Reduced motion (read once) ─────────────────────────────────────────────
var REDUCE = (typeof window !== "undefined" && window.matchMedia)
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

// ── Shared rAF loop ────────────────────────────────────────────────────────
// Each registered animator is `{ tab, refs }` where `refs` is whatever the
// per-tab animator needs (cached SVG element refs). We don't unmount the
// loop between frames; instead we start it on the first registration and
// stop it when the registry drains.
var animators = [];
var loopRunning = false;
var loopFrame = 0;

function startLoop() {
  if (loopRunning) return;
  loopRunning = true;
  loopFrame = requestAnimationFrame(tick);
}
function stopLoop() {
  loopRunning = false;
  if (loopFrame) {
    cancelAnimationFrame(loopFrame);
    loopFrame = 0;
  }
}
function tick(t) {
  for (var i = 0; i < animators.length; i++) {
    var a = animators[i];
    try { ANIMATORS[a.tab] && ANIMATORS[a.tab](t, a.refs); } catch (e) { void e; /* skip frame on transient error */ }
  }
  if (animators.length === 0) { stopLoop(); return; }
  loopFrame = requestAnimationFrame(tick);
}

function register(entry) {
  animators.push(entry);
  startLoop();
  return entry;
}
function unregister(entry) {
  var i = animators.indexOf(entry);
  if (i !== -1) animators.splice(i, 1);
  if (animators.length === 0) stopLoop();
}

// ── Per-tab animators ──────────────────────────────────────────────────────
// Each function receives (time, refs) and mutates SVG attributes directly.
// Periods come from the README animation table.

var ANIMATORS = {
  accounts: function (t, r) {
    var s = Math.sin(t / 6500 * TAU) * 1.5;
    if (r.front) r.front.setAttribute("transform", "translate(" + s.toFixed(2) + " " + (-s).toFixed(2) + ")");
    if (r.back)  r.back .setAttribute("transform", "translate(" + (-s).toFixed(2) + " " + s.toFixed(2) + ")");
  },
  departments: function (t, r) {
    var cyc = (t / 8000) % 1;
    var order = [0, 1, 3, 2];
    for (var q = 0; q < 4; q++) {
      var idx = order[q], phase = q / 4;
      var dd = Math.abs(((cyc - phase + 1) % 1));
      if (dd > 0.5) dd = 1 - dd;
      var lit = Math.max(0, 1 - dd * 4);
      r.rects[idx].setAttribute("opacity", (0.3 + 0.7 * lit).toFixed(3));
    }
  },
  partners: function (t, r) {
    var o = Math.sin(t / 7000 * TAU) * 0.06;
    if (r.a) r.a.setAttribute("transform", "scale(" + (1 - o).toFixed(4) + ")");
    if (r.b) r.b.setAttribute("transform", "scale(" + (1 + o).toFixed(4) + ")");
  },
  meetings: function (t, r) {
    var cyc = (t / 6400) % 1;
    var dots = r.dots;
    for (var w = 0; w < dots.length; w++) {
      var phase = w / dots.length;
      var dd = Math.abs(((cyc - phase + 1) % 1));
      if (dd > 0.5) dd = 1 - dd;
      var lit = Math.max(0, 1 - dd * 4);
      dots[w].setAttribute("opacity", (0.35 + 0.65 * lit).toFixed(3));
    }
  },
  pipeline: function (t, r) {
    var per = [5200, 6100, 4700, 5800], ph = [0, 1.7, 3.1, 4.6];
    for (var b = 0; b < r.ticks.length; b++) {
      var y = -1.5 + Math.sin(t / per[b] * TAU + ph[b]) * 3.2;
      if (y > 1.5) y = 1.5;
      if (y < -5)  y = -5;
      r.ticks[b].setAttribute("y1", y.toFixed(2));
    }
  },
  cadence: function (t, r) {
    var ang = (t / 9000 * 360) % 360;
    if (r.dot) r.dot.setAttribute("transform", "rotate(" + ang.toFixed(2) + " 0 0)");
  },
  gauge: function (t, r) {
    var sw = Math.sin(t / 6000 * TAU) * 24;
    if (r.needle) r.needle.setAttribute("transform", "rotate(" + sw.toFixed(2) + " 0 3)");
  },
  team: function (t, r) {
    var amp = (Math.sin(t / 7000 * TAU) * 0.5 + 0.5) * 1.6;
    var dirs = [[0, -1], [-0.864, 0.504], [0.864, 0.504]];
    for (var c = 0; c < 3; c++) {
      r.circles[c].setAttribute("transform", "translate(" + (dirs[c][0] * amp).toFixed(2) + " " + (dirs[c][1] * amp).toFixed(2) + ")");
    }
  },
  route: function (t, r) {
    var u = (t / 7000) % 1;
    var pts = [[-5.5, -4.5], [-5.5, 0], [5.5, 0], [5.5, 4.5]];
    var seg = [4.5, 11, 4.5], total = 20;
    var d = u * total, f;
    var pos;
    if (d < seg[0]) {
      f = d / seg[0];
      pos = [pts[0][0] + (pts[1][0] - pts[0][0]) * f, pts[0][1] + (pts[1][1] - pts[0][1]) * f];
    } else if ((d - seg[0]) < seg[1]) {
      f = (d - seg[0]) / seg[1];
      pos = [pts[1][0] + (pts[2][0] - pts[1][0]) * f, pts[1][1] + (pts[2][1] - pts[1][1]) * f];
    } else {
      f = (d - seg[0] - seg[1]) / seg[2];
      pos = [pts[2][0] + (pts[3][0] - pts[2][0]) * f, pts[2][1] + (pts[3][1] - pts[2][1]) * f];
    }
    if (r.tracer) {
      r.tracer.setAttribute("cx", pos[0].toFixed(2));
      r.tracer.setAttribute("cy", pos[1].toFixed(2));
    }
  },
  settings: function (t, r) {
    var per = [5500, 7000, 6200], ph = [0, 2, 4];
    for (var k = 0; k < r.knobs.length; k++) {
      var sx = Math.sin(t / per[k] * TAU + ph[k]) * 4.5;
      r.knobs[k].setAttribute("cx", sx.toFixed(2));
    }
  },
  updates: function (t, r) {
    // "Something happened" pulse — the event flag disc breathes 0.4 → 1.0
    // → 0.4 over 6.2s. Slow enough to read as a heartbeat, not strobe.
    var u = (t / 6200) % 1;
    var o = 0.4 + 0.6 * (0.5 - 0.5 * Math.cos(u * TAU));
    if (r.flag) r.flag.setAttribute("opacity", o.toFixed(3));
  },
};

// ── Per-tab glyph renderers + ref binders ─────────────────────────────────
// We render React elements with refs, then capture them once on mount and
// hand them to the animator. The glyph color comes from `currentColor`.

// ── Disc chrome ────────────────────────────────────────────────────────────
// Size matrix from README §1.
var SIZE_TABLE = {
  22:  { glyph: 11,  glow: 10 },
  32:  { glyph: 14,  glow: 14 },
  52:  { glyph: 22,  glow: 22 },
  72:  { glyph: 30,  glow: 28 },
  120: { glyph: 48,  glow: 40 },
};
function sizeKey(n) {
  if (n >= 120) return 120;
  if (n >= 72)  return 72;
  if (n >= 52)  return 52;
  if (n >= 32)  return 32;
  return 22;
}

// Pip / brand mark — never animated, uses the same disc chrome.
function PipGlyph() {
  return (
    <>
      <circle cx="0" cy="-4"  r="4"   fill="currentColor" />
      <circle cx="0" cy="4.5" r="2.8" fill="currentColor" opacity="0.42" />
    </>
  );
}

function MarkImpl({ tab, size, active }) {
  // Map legacy tab names → canonical
  var t = tab === "routes" ? "route"
        : tab === "workspaces" ? "accounts"
        : tab === "diagnostics" ? "settings"  // diagnostics keeps its own glyph below
        : tab;

  var px = size || 22;
  var key = sizeKey(px);
  var glyphPx = SIZE_TABLE[key].glyph;
  var glowPx = SIZE_TABLE[key].glow;

  var animatable = px >= 52;

  // refs the animator binds to
  var svgRef = useRef(null);
  var refBag = useRef({});

  useEffect(function () {
    if (!animatable || REDUCE) return;
    if (!ANIMATORS[t]) return;

    var svg = svgRef.current;
    if (!svg) return;

    var bag = {};
    if (t === "accounts") {
      var rr = svg.querySelectorAll("rect");
      bag.back = rr[0]; bag.front = rr[1];
    } else if (t === "departments") {
      bag.rects = svg.querySelectorAll("rect");
      // soften initial state so the cycle is visible
      for (var k = 0; k < bag.rects.length; k++) bag.rects[k].setAttribute("opacity", "0.3");
    } else if (t === "partners") {
      var pc = svg.querySelectorAll("circle");
      bag.a = pc[0]; bag.b = pc[1];
    } else if (t === "meetings") {
      var mc = svg.querySelectorAll("circle");
      bag.dots = [];
      for (var j = 1; j < mc.length; j++) {
        mc[j].setAttribute("opacity", "0.35");
        bag.dots.push(mc[j]);
      }
    } else if (t === "pipeline") {
      var lns = svg.querySelectorAll("line");
      bag.ticks = [];
      for (var p = 1; p < lns.length; p++) bag.ticks.push(lns[p]);
    } else if (t === "cadence") {
      var cc = svg.querySelectorAll("circle");
      // Swap the dashed ring for a faint solid ring on animated instances so
      // the orbiting dot doesn't fight a dash strobe (rail/compact keep dashes).
      if (cc[0]) {
        cc[0].setAttribute("stroke-dasharray", "");
        cc[0].setAttribute("opacity", "0.4");
      }
      bag.dot = cc[1];
    } else if (t === "gauge") {
      bag.needle = svg.querySelector("line");
    } else if (t === "team") {
      bag.circles = svg.querySelectorAll("circle");
    } else if (t === "route") {
      var tracer = document.createElementNS(SVG_NS, "circle");
      tracer.setAttribute("r", "1.7");
      tracer.setAttribute("fill", "currentColor");
      svg.appendChild(tracer);
      bag.tracer = tracer;
    } else if (t === "settings") {
      bag.knobs = svg.querySelectorAll("circle");
    } else if (t === "updates") {
      bag.flag = svg.querySelector("circle");
    }
    refBag.current = bag;

    var entry = register({ tab: t, refs: bag });
    return function () {
      unregister(entry);
      if (t === "route" && bag.tracer && bag.tracer.parentNode) {
        bag.tracer.parentNode.removeChild(bag.tracer);
      }
    };
  }, [t, animatable]);

  // Glyph
  var glyph;
  if (t === "pip") {
    glyph = <PipGlyph />;
  } else if (t === "accounts") {
    glyph = (
      <>
        <rect x="-5.5" y="-3" width="9" height="7" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="-3.5" y="-5" width="9" height="7" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </>
    );
  } else if (t === "departments") {
    glyph = (
      <>
        <rect x="-5.5" y="-5.5" width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1"    y="-5.5" width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="-5.5" y="1"    width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1"    y="1"    width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </>
    );
  } else if (t === "partners") {
    glyph = (
      <>
        <circle cx="-2.6" cy="0" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="2.6"  cy="0" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </>
    );
  } else if (t === "meetings") {
    glyph = (
      <>
        <circle cx="0" cy="0" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="0"    cy="-6.4" r="1.6" fill="currentColor" />
        <circle cx="6.4"  cy="0"    r="1.6" fill="currentColor" />
        <circle cx="0"    cy="6.4"  r="1.6" fill="currentColor" />
        <circle cx="-6.4" cy="0"    r="1.6" fill="currentColor" />
      </>
    );
  } else if (t === "pipeline") {
    glyph = (
      <>
        <line x1="-6.5" y1="4"    x2="6.5"  y2="4" stroke="currentColor" strokeWidth="1"   opacity="0.5" />
        <line x1="-5"   y1="-2.5" x2="-5"   y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="-1.5" y1="0"    x2="-1.5" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="2"    y1="-4"   x2="2"    y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="5.5"  y1="-1"   x2="5.5"  y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>
    );
  } else if (t === "cadence") {
    glyph = (
      <>
        <circle cx="0" cy="0" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="0.5 2.4" />
        <circle cx="5.5" cy="0" r="1.8" fill="currentColor" />
      </>
    );
  } else if (t === "gauge") {
    glyph = (
      <>
        <path d="M -6 3 A 6 6 0 0 1 6 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="0" y1="3" x2="2.8" y2="-2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="0" cy="3" r="1.3" fill="currentColor" />
      </>
    );
  } else if (t === "team") {
    glyph = (
      <>
        <circle cx="0"  cy="-4" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="-4" cy="3"  r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4"  cy="3"  r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </>
    );
  } else if (t === "route") {
    glyph = (
      <>
        <circle cx="-5.5" cy="-4.5" r="1.4" fill="currentColor" />
        <path d="M -5.5 -4.5 L -5.5 0 L 5.5 0 L 5.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="5.5" cy="4.5" r="1.4" fill="currentColor" />
      </>
    );
  } else if (t === "settings") {
    glyph = (
      <>
        <line x1="-6.5" y1="-5" x2="6.5" y2="-5" stroke="currentColor" strokeWidth="1" opacity="0.45" />
        <line x1="-6.5" y1="0"  x2="6.5" y2="0"  stroke="currentColor" strokeWidth="1" opacity="0.45" />
        <line x1="-6.5" y1="5"  x2="6.5" y2="5"  stroke="currentColor" strokeWidth="1" opacity="0.45" />
        <circle cx="-2" cy="-5" r="1.7" fill="currentColor" />
        <circle cx="3"  cy="0"  r="1.7" fill="currentColor" />
        <circle cx="-1" cy="5"  r="1.7" fill="currentColor" />
      </>
    );
  } else if (t === "updates") {
    // Timeline of three ticks with an event flag on the middle one.
    // The flag (filled disc) is the first <circle> so the animator's
    // querySelector finds it.
    glyph = (
      <>
        <circle cx="2.5" cy="0" r="1.9" fill="currentColor" />
        <line x1="-6"   y1="-5" x2="2"   y2="-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
        <line x1="-6"   y1="0"  x2="-0.5" y2="0"  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="-6"   y1="5"  x2="4"   y2="5"  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
      </>
    );
  } else {
    // unknown tab: render an empty disc
    glyph = null;
  }

  var className = "fol-mark fol-mark-" + key + (active ? " is-active" : "");
  return (
    <span
      className={className}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        display: "inline-grid",
        placeItems: "center",
        background: "var(--c-folio-tint-2)",
        border: "1px solid var(--c-folio-border)",
        boxShadow: "0 0 " + glowPx + "px var(--c-folio-shadow)",
        // CSS var consumed by the ambient glow keyframe in index.html so
        // each size keeps its own glow radius across the pulse.
        ["--mark-glow"]: glowPx + "px",
        position: "relative",
        flexShrink: 0,
        color: "var(--c-folio-deep)",
      }}
      aria-hidden="true"
    >
      <svg
        ref={svgRef}
        xmlns={SVG_NS}
        viewBox="-10 -10 20 20"
        width={glyphPx}
        height={glyphPx}
        style={{ display: "block", color: "var(--c-folio-deep)" }}
      >
        {glyph}
      </svg>
    </span>
  );
}

export var Mark = memo(MarkImpl);
export default Mark;
