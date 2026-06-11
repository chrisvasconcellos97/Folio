// hexMotif.jsx — Hex Grammar v1 (item 45)
//
// Four lightweight primitives that spread the Bold Hex visual language across
// the app as *presence cues* — hexes appear where Pip is working or has
// authored content, never as generic decoration.
//
// Rules (locked in CLAUDE.md item 45):
//  - Colors via var(--c-accent) only — Life-mode orange + both themes inherit free
//  - position:absolute + pointer-events:none on all decorations
//  - Cards get signatures, ROWS NEVER
//  - Motifs are decoration, NEVER a redrawn Pip
//  - Reduced-motion renders static mid-frame
//
// Geometry directly translated from public/mockups/hex-spread.html hexD() +
// makeChain() + makeLattice() helper functions.

var TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// hexPathD — flat hexagon SVG "d" string (6 points)
// rot = Math.PI / 6 gives a pointy-top hex (same as mockup's TAU/12)
// ---------------------------------------------------------------------------
export function hexPathD(cx, cy, r, rot) {
  var d = "";
  for (var k = 0; k < 6; k++) {
    var a = k * TAU / 6 + (rot || 0);
    d += (k === 0 ? "M" : "L") +
      (cx + r * Math.cos(a)).toFixed(1) + " " +
      (cy + r * Math.sin(a)).toFixed(1);
  }
  return d + "Z";
}

// ---------------------------------------------------------------------------
// HexSignature — static fading corner chain, bottom-right of cards.
// Cell count encodes authorship:
//   cells=3, peak=0.13 → user-content cards (accounts, projects, cadences, tasks)
//   cells=5, peak=0.30 → Pip-authored cards (PipCard, operator panel)
//
// Opacity ladder: rightmost cell = peak, each step left × 0.58
// ---------------------------------------------------------------------------
export function HexSignature({ cells, peak, cell, style }) {
  var n = cells || 3;
  var pk = peak != null ? peak : 0.13;
  var r = cell != null ? cell : 6.5;
  // Derived from makeChain: step = r*2.1, w = ceil(step*n+r), h = ceil(r*2+8)
  var step = r * 2.1;
  var w = Math.ceil(step * n + r);
  var h = Math.ceil(r * 2 + 8);

  var paths = [];
  for (var i = 0; i < n; i++) {
    var op = pk * Math.pow(0.58, i);
    // Cells drawn right-to-left (i=0 is rightmost = highest opacity)
    var cx = w - r - 4 - i * step;
    var cy = h / 2;
    paths.push(
      <path
        key={i}
        d={hexPathD(cx, cy, r, TAU / 12)}
        fill="none"
        strokeWidth={1.2}
        opacity={op.toFixed(3)}
        strokeLinejoin="round"
        style={{ stroke: "var(--c-accent)" }}
      />
    );
  }

  return (
    <svg
      width={w}
      height={h}
      viewBox={"0 0 " + w + " " + h}
      aria-hidden="true"
      style={Object.assign({
        position: "absolute",
        bottom: 8,
        right: 10,
        pointerEvents: "none",
      }, style || {})}
    >
      {paths}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HexPulse — 3 tiny hexes that breathe on the 4.8s clock (staggered wave).
// Used ONLY where Pip is actively working: chat thinking indicator,
// SummarizeStreamingOverlay.
// Reduced-motion: renders a static mid-frame snapshot.
// ---------------------------------------------------------------------------

// Module-level style injected once.
var _pulseStyleInjected = false;
function ensurePulseStyle() {
  if (_pulseStyleInjected) return;
  _pulseStyleInjected = true;
  if (typeof document === "undefined") return;
  var style = document.createElement("style");
  style.textContent = [
    "@keyframes hex-pulse-breath {",
    "  0%,100% { transform: scale(0.55); opacity: 0.25; }",
    "  50%      { transform: scale(1);    opacity: 0.95; }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .hex-pulse-cell { animation: none !important; }",
    "}"
  ].join("\n");
  document.head.appendChild(style);
}

export function HexPulse({ r, style }) {
  ensurePulseStyle();
  var cr = r || 5;
  var spacing = cr * 2.2;
  var w = spacing * 2 + cr * 2 + 4;
  var h = cr * 2 + 8;
  var cy = h / 2;

  // stagger: each cell delayed by -0.86s from previous (3 cells across 4.8s → 1.6s each)
  var delays = [0, -0.86, -1.72];

  return (
    <svg
      width={w}
      height={h}
      viewBox={"0 0 " + w + " " + h}
      aria-hidden="true"
      style={Object.assign({ display: "inline-block", verticalAlign: "middle" }, style || {})}
    >
      {[0, 1, 2].map(function (i) {
        var cx = cr + 2 + i * spacing;
        return (
          <path
            key={i}
            className="hex-pulse-cell"
            d={hexPathD(cx, cy, cr, TAU / 12)}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={{
              stroke: "var(--c-accent)",
              animation: "hex-pulse-breath 4.8s ease-in-out " + delays[i] + "s infinite",
              transformOrigin: cx + "px " + cy + "px",
            }}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HexField — static radial-falloff lattice.
// Used behind the Home hero orb. peak ~ 0.16, fading to 0 at ~200px radius.
// Fills parent absolutely; caller needs position:relative.
// ---------------------------------------------------------------------------
export function HexField({ r, peak, cx: ocx, cy: ocy }) {
  var cr = r || 15;
  var pk = peak != null ? peak : 0.16;
  // We render the SVG with 100% width/height via style;
  // lattice built at a reference size then scales via preserveAspectRatio.
  var W = 400, H = 300;
  var fcx = ocx != null ? ocx : W / 2;
  var fcy = ocy != null ? ocy : H / 2;

  var dx = Math.sqrt(3) * cr;
  var dy = 1.5 * cr;

  var paths = [];
  for (var row = 0; row * dy < H + cr; row++) {
    for (var col = 0; col * dx < W + cr; col++) {
      var x = col * dx + (row % 2) * (dx / 2);
      var y = row * dy;
      var dist = Math.sqrt(Math.pow(x - fcx, 2) + Math.pow(y - fcy, 2));
      var op = Math.max(0, pk * (1 - dist / 200));
      if (op <= 0.004) continue;
      paths.push(
        <path
          key={row + "_" + col}
          d={hexPathD(x, y, cr * 0.92, TAU / 12)}
          fill="none"
          strokeWidth={1}
          opacity={op.toFixed(3)}
          strokeLinejoin="round"
          style={{ stroke: "var(--c-accent)" }}
        />
      );
    }
  }

  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {paths}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HexLattice — uniform static lattice watermark (~0.045 opacity).
// Empty states only. Fills parent absolutely.
// ---------------------------------------------------------------------------
export function HexLattice({ opacity, r }) {
  var cr = r || 15;
  var op = opacity != null ? opacity : 0.045;
  var W = 400, H = 300;

  var dx = Math.sqrt(3) * cr;
  var dy = 1.5 * cr;

  var paths = [];
  for (var row = 0; row * dy < H + cr; row++) {
    for (var col = 0; col * dx < W + cr; col++) {
      var x = col * dx + (row % 2) * (dx / 2);
      var y = row * dy;
      paths.push(
        <path
          key={row + "_" + col}
          d={hexPathD(x, y, cr * 0.92, TAU / 12)}
          fill="none"
          strokeWidth={1}
          opacity={op.toFixed(3)}
          strokeLinejoin="round"
          style={{ stroke: "var(--c-accent)" }}
        />
      );
    }
  }

  return (
    <svg
      viewBox={"0 0 " + W + " " + H}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {paths}
    </svg>
  );
}
