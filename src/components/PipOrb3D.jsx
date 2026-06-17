// ─── PipOrb3D — 3D "Bold Hex" Pip renderer ───────────────────────────────────
// Renders Pip's locked 3D form: two hex-tiled spheres inside a slowly turning
// hexagonal ring, all breathing together on a 2.4s cycle.
//
// Design locked by Chris (June 2026). All geometry driven by pip3dGeometry.js.
// This component only renders what buildPipFrame() returns — no geometry here.
//
// Performance architecture:
//   • ONE shared rAF loop at module scope (all instances share it)
//   • Imperative SVG attribute updates via refs (no React state per frame)
//   • IntersectionObserver pauses offscreen instances
//   • visibilitychange pauses hidden-tab instances
//   • Sim time accumulates only while running (no time jumps on resume)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { buildPipFrame, PIP_SPEC } from "../lib/pip3dGeometry.js";

// ── Unique ID counter for SVG gradient IDs ────────────────────────────────────
var _uid = 0;
function nextId() { return "p3d" + (++_uid); }

// ── Module-level rAF loop registry ────────────────────────────────────────────
// All PipOrb3D instances register an update callback here; one rAF drives all.
var _callbacks = new Set();
var _rafId = null;
var _simTime = 0;          // accumulated simulation time (pauses when hidden)
var _lastTS = null;         // last rAF timestamp
var _pageVisible = true;

function _tick(ts) {
  _rafId = requestAnimationFrame(_tick);
  if (_lastTS === null) _lastTS = ts;
  var dt = (ts - _lastTS) / 1000;
  _lastTS = ts;
  if (_pageVisible && dt > 0 && dt < 0.5) _simTime += dt;
  _callbacks.forEach(function (cb) { cb(_simTime); });
}

function _startLoop() {
  if (_rafId === null) {
    _lastTS = null;
    _rafId = requestAnimationFrame(_tick);
  }
}

function _stopLoop() {
  if (_rafId !== null && _callbacks.size === 0) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
    _lastTS = null;
  }
}

// Handle page visibility — pause accumulation when tab is hidden
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", function () {
    _pageVisible = !document.hidden;
    if (!_pageVisible) _lastTS = null; // prevent time jump on resume
  });
}

function registerCallback(cb) {
  _callbacks.add(cb);
  _startLoop();
  return function () {
    _callbacks.delete(cb);
    _stopLoop();
  };
}

// ── SVG namespace helper ──────────────────────────────────────────────────────
var NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  var el = document.createElementNS(NS, tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
  }
  return el;
}
// ── Bucket color getters using CSS vars ───────────────────────────────────────
// Using var() so they re-theme on accent change (Life mode, etc.)
function bucketColors() {
  return ["var(--accent-deep)", "var(--accent)", "var(--accent)", "var(--accent-hi)"];
}

// ── Build the static SVG structure, return refs to animatable elements ────────
function buildSVGScene(svg, ids) {
  svg.setAttribute("viewBox", PIP_SPEC.viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.overflow = "visible";

  var defs = svgEl("defs");
  svg.appendChild(defs);

  var colors = bucketColors();
  var bOpa   = PIP_SPEC.bucketOpacities;
  var bSw    = PIP_SPEC.bucketSwMult;
  var sw     = PIP_SPEC.ring.sw;

  // Outer ambient glow gradient
  var glowGradId = ids.glowGrad;
  var glowGrad = svgEl("radialGradient", { id: glowGradId });
  var gStops = PIP_SPEC.outerGlowGrad.stops;
  gStops.forEach(function (s, i) {
    var stop = svgEl("stop");
    stop.setAttribute("offset", s.offset);
    stop.style.stopColor = "var(--accent)";
    stop.style.stopOpacity = s.opacity;
    glowGrad.appendChild(stop);
  });
  defs.appendChild(glowGrad);

  // Head core gradient
  var headGradId = ids.headGrad;
  var headGrad = svgEl("radialGradient", {
    id: headGradId,
    cx: PIP_SPEC.coreGrad.cx,
    cy: PIP_SPEC.coreGrad.cy,
    r:  PIP_SPEC.coreGrad.r,
  });
  var cStops = PIP_SPEC.coreGrad.stops;
  var headStopColors = ["var(--accent-hi)", "var(--accent)", "var(--accent)"];
  cStops.forEach(function (s, i) {
    var stop = svgEl("stop");
    stop.setAttribute("offset", s.offset);
    stop.style.stopColor = headStopColors[i];
    stop.style.stopOpacity = s.opacity;
    headGrad.appendChild(stop);
  });
  defs.appendChild(headGrad);

  // Tail core gradient (same structure)
  var tailGradId = ids.tailGrad;
  var tailGrad = svgEl("radialGradient", {
    id: tailGradId,
    cx: PIP_SPEC.coreGrad.cx,
    cy: PIP_SPEC.coreGrad.cy,
    r:  PIP_SPEC.coreGrad.r,
  });
  cStops.forEach(function (s, i) {
    var stop = svgEl("stop");
    stop.setAttribute("offset", s.offset);
    stop.style.stopColor = headStopColors[i];
    stop.style.stopOpacity = s.opacity;
    tailGrad.appendChild(stop);
  });
  defs.appendChild(tailGrad);

  // Outer glow circle
  var glowCircle = svgEl("circle", { cx: 0, cy: 0, r: PIP_SPEC.outerGlowGrad.r, fill: "url(#" + glowGradId + ")" });
  svg.appendChild(glowCircle);

  // Ring back group
  var gRingBack = svgEl("g");
  svg.appendChild(gRingBack);
  var ringBackPaths = [];
  for (var i = 0; i < 2; i++) {
    var p = svgEl("path", {
      fill: "none",
      stroke: colors[i],
      "stroke-width": (sw * bSw[i]).toFixed(2),
      opacity: bOpa[i],
      "stroke-linejoin": "round",
    });
    gRingBack.appendChild(p);
    ringBackPaths.push(p);
  }

  // Pip sphere group
  var gPip = svgEl("g");
  svg.appendChild(gPip);

  // ── Tail sphere ──
  var gTail = svgEl("g", { opacity: PIP_SPEC.sphereTail.opacity });
  gPip.appendChild(gTail);
  var tailCore = svgEl("circle", {
    cx: PIP_SPEC.sphereTail.cx,
    cy: PIP_SPEC.sphereTail.cy,
    r:  (PIP_SPEC.sphereTail.r * 0.92).toFixed(1),
    fill: "url(#" + tailGradId + ")",
  });
  gTail.appendChild(tailCore);
  var gTailBack = svgEl("g"); gTail.appendChild(gTailBack);
  var gTailFront = svgEl("g"); gTail.appendChild(gTailFront);
  var tailBPaths = [], tailFPaths = [];
  for (var i = 0; i < 2; i++) {
    var p = svgEl("path", {
      fill: "none",
      stroke: colors[i],
      "stroke-width": (sw * bSw[i]).toFixed(2),
      opacity: bOpa[i],
      "stroke-linejoin": "round",
    });
    gTailBack.appendChild(p); tailBPaths.push(p);
  }
  for (var i = 2; i < 4; i++) {
    var p = svgEl("path", {
      fill: "none",
      stroke: colors[i],
      "stroke-width": (sw * bSw[i]).toFixed(2),
      opacity: bOpa[i],
      "stroke-linejoin": "round",
    });
    gTailFront.appendChild(p); tailFPaths.push(p);
  }

  // ── Head sphere ──
  var gHead = svgEl("g", { opacity: PIP_SPEC.sphereHead.opacity });
  gPip.appendChild(gHead);
  var headCore = svgEl("circle", {
    cx: PIP_SPEC.sphereHead.cx,
    cy: PIP_SPEC.sphereHead.cy,
    r:  (PIP_SPEC.sphereHead.r * 0.92).toFixed(1),
    fill: "url(#" + headGradId + ")",
  });
  gHead.appendChild(headCore);
  var gHeadBack = svgEl("g"); gHead.appendChild(gHeadBack);
  var gHeadFront = svgEl("g"); gHead.appendChild(gHeadFront);
  var headBPaths = [], headFPaths = [];
  for (var i = 0; i < 2; i++) {
    var p = svgEl("path", {
      fill: "none",
      stroke: colors[i],
      "stroke-width": (sw * bSw[i]).toFixed(2),
      opacity: bOpa[i],
      "stroke-linejoin": "round",
    });
    gHeadBack.appendChild(p); headBPaths.push(p);
  }
  for (var i = 2; i < 4; i++) {
    var p = svgEl("path", {
      fill: "none",
      stroke: colors[i],
      "stroke-width": (sw * bSw[i]).toFixed(2),
      opacity: bOpa[i],
      "stroke-linejoin": "round",
    });
    gHeadFront.appendChild(p); headFPaths.push(p);
  }

  // Ring front group
  var gRingFront = svgEl("g");
  svg.appendChild(gRingFront);
  var ringFrontPaths = [];
  for (var i = 2; i < 4; i++) {
    var p = svgEl("path", {
      fill: "none",
      stroke: colors[i],
      "stroke-width": (sw * bSw[i]).toFixed(2),
      opacity: bOpa[i],
      "stroke-linejoin": "round",
    });
    gRingFront.appendChild(p);
    ringFrontPaths.push(p);
  }

  return {
    glowCircle,
    ringBackPaths,   // 2 paths for ring back buckets (idx 0,1)
    ringFrontPaths,  // 2 paths for ring front buckets (idx 2,3)
    gPip,
    tailCore,
    tailBPaths,      // 2 paths for tail back buckets (idx 0,1)
    tailFPaths,      // 2 paths for tail front buckets (idx 2,3)
    headCore,
    headBPaths,      // 2 paths for head back buckets (idx 0,1)
    headFPaths,      // 2 paths for head front buckets (idx 2,3)
  };
}

// ── PipOrb3D component ─────────────────────────────────────────────────────────
export function PipOrb3D({ state, isStatic }) {
  var svgRef = useRef(null);
  var refs   = useRef(null);    // animatable SVG elements
  var idsRef = useRef(null);    // unique SVG IDs for this instance

  // Allocate gradient IDs once
  if (!idsRef.current) {
    var base = nextId();
    idsRef.current = { glowGrad: base + "g", headGrad: base + "h", tailGrad: base + "t" };
  }

  // Is motion reduced?
  var reducedMotion = typeof window !== "undefined"
    && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Intersection observer state
  var visibleRef = useRef(true);

  // Live state — read by the rAF callback so state changes apply without
  // re-running the effect (a closure over `state` would go stale).
  var stateRef = useRef(state);
  stateRef.current = state;

  // Per-instance scaled sim time. Accumulating (dt × timeScale) instead of
  // multiplying total time by the scale means a state change speeds the
  // animation up/down smoothly with no positional jump.
  var scaledTimeRef = useRef(0);
  var lastSimRef = useRef(null);

  useEffect(function () {
    var svgEl2 = svgRef.current;
    if (!svgEl2) return;

    // Build the SVG scene once
    while (svgEl2.firstChild) svgEl2.removeChild(svgEl2.firstChild);
    refs.current = buildSVGScene(svgEl2, idsRef.current);

    // Static mode — render one frame and stop
    if (isStatic || reducedMotion) {
      var frame = buildPipFrame(1.1);
      applyFrame(refs.current, frame, "idle");
      return;
    }

    // IntersectionObserver — pause when offscreen
    var observer = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { visibleRef.current = e.isIntersecting; });
      }, { threshold: 0 });
      observer.observe(svgEl2.parentElement || svgEl2);
    }

    // Register in the shared rAF loop
    function onFrame(simTime) {
      if (lastSimRef.current === null) lastSimRef.current = simTime;
      var dt = simTime - lastSimRef.current;
      lastSimRef.current = simTime;
      if (!visibleRef.current || !refs.current) return;
      var liveState = stateRef.current || "idle";
      var scale = PIP_SPEC.stateTimeScale[liveState] || 1;
      scaledTimeRef.current += dt * scale;
      // Speaking → ripple the ring like a waveform; idle keeps speakAmp 0 so the
      // frozen geometry is untouched.
      var speakAmp = liveState === "speaking" ? PIP_SPEC.speakingRingAmp : 0;
      var frame = buildPipFrame(scaledTimeRef.current, speakAmp);
      applyFrame(refs.current, frame, liveState, simTime);
    }

    var unregister = registerCallback(onFrame);

    return function () {
      unregister();
      if (observer) observer.disconnect();
    };
  }, [isStatic, reducedMotion]); // state intentionally omitted — read via stateRef each frame

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", overflow: "visible" }}
      aria-hidden="true"
    />
  );
}

// ── Apply one frame to the live SVG elements (imperative, no React re-render) ─
// simTime (unscaled wall-clock sim seconds) drives the speaking glow pulse so
// its 0.42s period stays exact regardless of the state timeScale.
function applyFrame(r, frame, state, simTime) {
  // Outer glow
  var glowOpa = frame.outerGlowOpacity;
  // Speaking: oscillate the outer glow on the spec's 0.42s cycle
  if (state === "speaking" && simTime !== undefined) {
    var ph = 0.5 - 0.5 * Math.cos((Math.PI * 2 * simTime) / PIP_SPEC.speakingGlowPeriod);
    glowOpa = PIP_SPEC.speakingGlowMin + (PIP_SPEC.speakingGlowMax - PIP_SPEC.speakingGlowMin) * ph;
  }
  r.glowCircle.setAttribute("opacity", glowOpa.toFixed(2));

  // Ring paths — back buckets 0,1 → ringBackPaths[0,1], front 2,3 → ringFrontPaths[0,1]
  r.ringBackPaths[0].setAttribute("d", frame.ringPaths[0] || "M0 0");
  r.ringBackPaths[1].setAttribute("d", frame.ringPaths[1] || "M0 0");
  r.ringFrontPaths[0].setAttribute("d", frame.ringPaths[2] || "M0 0");
  r.ringFrontPaths[1].setAttribute("d", frame.ringPaths[3] || "M0 0");

  // Pip sphere group scale
  r.gPip.setAttribute("transform", "scale(" + frame.sphereScale.toFixed(3) + ")");

  // Head core
  r.headCore.setAttribute("r", frame.headCoreR);
  r.headCore.setAttribute("opacity", frame.coreOpacity.toFixed(2));

  // Head hex paths
  r.headBPaths[0].setAttribute("d", frame.headPaths[0] || "M0 0");
  r.headBPaths[1].setAttribute("d", frame.headPaths[1] || "M0 0");
  r.headFPaths[0].setAttribute("d", frame.headPaths[2] || "M0 0");
  r.headFPaths[1].setAttribute("d", frame.headPaths[3] || "M0 0");

  // Tail core
  r.tailCore.setAttribute("r", frame.tailCoreR);
  r.tailCore.setAttribute("opacity", frame.coreOpacity.toFixed(2));

  // Tail hex paths
  r.tailBPaths[0].setAttribute("d", frame.tailPaths[0] || "M0 0");
  r.tailBPaths[1].setAttribute("d", frame.tailPaths[1] || "M0 0");
  r.tailFPaths[0].setAttribute("d", frame.tailPaths[2] || "M0 0");
  r.tailFPaths[1].setAttribute("d", frame.tailPaths[3] || "M0 0");
}
