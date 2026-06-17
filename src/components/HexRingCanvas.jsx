import { useRef, useEffect } from "react";

// Canvas-based hex border animation that wraps the active Home hub card.
// Matches the same visual constants as PIP_SPEC (4.8s breath, same bs formula,
// same depth opacities) so the card and orb breathe in sync.
// The canvas is sized off the parent element on the first rAF frame.

var TAU     = Math.PI * 2;
var HEX_SPIN = 1 / 5500;   // full travel cycle in 5.5s
var BREATH_W = TAU / 4800;  // 4.8s breath (matches PIP_SPEC)

function buildPerimeter(W, H, spacing) {
  var pts = [];
  var r   = 18; // corner radius approximation (matches card border-radius)
  var edges = [
    { x0: r,   y0: 0,   x1: W - r, y1: 0,   nx:  0, ny: -1 },
    { x0: W,   y0: r,   x1: W,     y1: H - r, nx:  1, ny:  0 },
    { x0: W-r, y0: H,   x1: r,     y1: H,   nx:  0, ny:  1 },
    { x0: 0,   y0: H-r, x1: 0,     y1: r,   nx: -1, ny:  0 },
  ];
  for (var ei = 0; ei < edges.length; ei++) {
    var e   = edges[ei];
    var len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
    var n   = Math.max(1, Math.round(len / spacing));
    for (var i = 0; i < n; i++) {
      var t = i / n;
      pts.push({
        x:  e.x0 + (e.x1 - e.x0) * t,
        y:  e.y0 + (e.y1 - e.y0) * t,
        nx: e.nx,
        ny: e.ny,
      });
    }
  }
  return pts;
}

function drawHexCell(ctx, x, y, size, angle, alpha, strokeColor, fillColor) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  for (var i = 0; i < 6; i++) {
    var a  = (i / 6) * TAU + Math.PI / 6; // pointy-top
    var px = Math.cos(a) * size;
    var py = Math.sin(a) * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle   = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth   = 0.85;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Resolve the current accent color from CSS custom properties so the canvas
// respects theme changes (dark/light). Falls back to the default accent hex.
function resolveAccentColor(el) {
  try {
    var val = getComputedStyle(el || document.documentElement)
      .getPropertyValue("--c-accent").trim();
    return val || "#4a9b82";
  } catch (e) {
    return "#4a9b82";
  }
}

// active prop controls CSS opacity (0 → 1 with a 0.48s ease transition).
// The rAF loop is gated on active so the canvas is quiet when not visible.
export function HexRingCanvas({ active }) {
  var canvasRef = useRef(null);
  var stateRef  = useRef({ hexPhase: 0, lastTime: null, pts: null });

  useEffect(function () {
    var canvas = canvasRef.current;
    if (!canvas) return;

    // Respect prefers-reduced-motion — don't start the rAF loop
    var mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq && mq.matches) return;

    // Don't run the loop when not active (saves battery / CPU)
    if (!active) return;

    var rafId;
    var s = stateRef.current;

    function draw(timestamp) {
      if (!s.lastTime) s.lastTime = timestamp;
      var dt = timestamp - s.lastTime;
      s.lastTime = timestamp;

      // Size canvas on the first frame once the parent has a layout
      if (!s.pts) {
        var parent = canvas.parentElement;
        if (!parent || parent.offsetWidth === 0) {
          rafId = requestAnimationFrame(draw);
          return;
        }
        var W = parent.offsetWidth  + 12;
        var H = parent.offsetHeight + 12;
        canvas.width  = W;
        canvas.height = H;
        s.pts = buildPerimeter(W, H, 17);
      }

      var W2  = canvas.width;
      var H2  = canvas.height;
      var ctx = canvas.getContext("2d");
      if (!ctx) { rafId = requestAnimationFrame(draw); return; }

      ctx.clearRect(0, 0, W2, H2);

      s.hexPhase = (s.hexPhase + dt * HEX_SPIN) % 1;
      var breath = 0.5 + 0.5 * Math.sin(timestamp * BREATH_W);
      var bs     = 0.55 + 0.56 * breath;

      // Read the accent color from CSS custom properties each frame so it
      // responds to theme toggles without a remount.
      var accent = resolveAccentColor(canvas);

      var pts = s.pts;
      var N   = pts.length;

      for (var i = 0; i < N; i++) {
        var p     = pts[i];
        var t     = i / N;
        var delta = Math.abs(t - s.hexPhase);
        if (delta > 0.5) delta = 1 - delta;
        var bright    = Math.max(0, 1 - delta * 14);
        var twistAmt  = Math.sin(t * TAU * 2 + s.hexPhase * TAU) * 0.45;
        var angle     = Math.atan2(p.ny, p.nx) + Math.PI / 2 + twistAmt;
        var size      = (3.2 + bs * 2.1) * (0.65 + 0.35 * bright);
        var alpha     = bright > 0.1
          ? 0.22 + bright * 0.72
          : 0.08 + (bs - 0.55) * 0.18;
        var fill = bright > 0.1
          ? accent + Math.round((0.04 + bright * 0.28) * 255).toString(16).padStart(2, "0")
          : accent + "05";
        drawHexCell(ctx, p.x + p.nx * 6, p.y + p.ny * 6, size, angle, alpha, accent, fill);
      }

      // Leading-edge bright accent cell
      var li = Math.floor(s.hexPhase * N) % N;
      var lp = pts[li];
      var la = Math.atan2(lp.ny, lp.nx) + Math.PI / 2;
      drawHexCell(ctx, lp.x + lp.nx * 6, lp.y + lp.ny * 6, 5.5 + bs * 1.2, la, 0.9, accent, accent + "59");

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return function () { cancelAnimationFrame(rafId); };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position:   "absolute",
        top:        -6,
        left:       -6,
        width:      "calc(100% + 12px)",
        height:     "calc(100% + 12px)",
        pointerEvents: "none",
        zIndex:     0,
        opacity:    active ? 1 : 0,
        transition: "opacity 0.48s ease",
      }}
    />
  );
}
