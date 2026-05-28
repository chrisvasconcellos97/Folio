// Per-section sidebar marks — pulled from the light-theme design handoff
// and shipped to both themes per Chris's directive. Each is a 20×20
// viewBox SVG using `currentColor` so it picks up the active nav button's
// text color (accent when active, textSoft when idle).

var SVG = "http://www.w3.org/2000/svg";

function svgWrap(content, size) {
  return (
    <svg
      xmlns={SVG}
      viewBox="-10 -10 20 20"
      width={size || 18}
      height={size || 18}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {content}
    </svg>
  );
}

export var MARKS = {
  // Stacked folders (Accounts)
  accounts: function (size) {
    return svgWrap(
      <>
        <rect x="-5.5" y="-3" width="9" height="7" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="-3.5" y="-5" width="9" height="7" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </>,
      size
    );
  },
  // 4-up grid (Departments)
  departments: function (size) {
    return svgWrap(
      <>
        <rect x="-5.5" y="-5.5" width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1"    y="-5.5" width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="-5.5" y="1"    width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <rect x="1"    y="1"    width="4.5" height="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </>,
      size
    );
  },
  // Two overlapping circles (Partners)
  partners: function (size) {
    return svgWrap(
      <>
        <circle cx="-2.6" cy="0" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="2.6"  cy="0" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </>,
      size
    );
  },
  // Cardinal-dot ring (Meetings)
  meetings: function (size) {
    return svgWrap(
      <>
        <circle cx="0"    cy="0"    r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="0"    cy="-5.5" r="1.2" fill="currentColor" />
        <circle cx="5.5"  cy="0"    r="1.2" fill="currentColor" />
        <circle cx="0"    cy="5.5"  r="1.2" fill="currentColor" />
        <circle cx="-5.5" cy="0"    r="1.2" fill="currentColor" />
      </>,
      size
    );
  },
  // Pawn / arrow (Pipeline)
  pipeline: function (size) {
    return svgWrap(
      <path
        d="M -6.5 -4.5 L 6.5 -4.5 L 1.6 1.2 L 1.6 5.5 L -1.6 5.5 L -1.6 1.2 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />,
      size
    );
  },
  // Mini bar chart (Cadence)
  cadence: function (size) {
    return svgWrap(
      <>
        <line x1="-6.5" y1="4"  x2="6.5"  y2="4" stroke="currentColor" strokeWidth="1"   opacity="0.5" />
        <line x1="-5"   y1="-2.5" x2="-5" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="-1.5" y1="0"  x2="-1.5" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="2"    y1="-4" x2="2"    y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="5.5"  y1="-1" x2="5.5"  y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </>,
      size
    );
  },
  // Speedometer (Gauge)
  gauge: function (size) {
    return svgWrap(
      <>
        <path
          d="M -6 3 A 6 6 0 0 1 6 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <line x1="0" y1="3" x2="2.8" y2="-2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="0" cy="3" r="1.3" fill="currentColor" />
      </>,
      size
    );
  },
  // Pip orb (Pip)
  pip: function (size) {
    return svgWrap(
      <>
        <circle cx="0" cy="-4"  r="4"   fill="currentColor" />
        <circle cx="0" cy="4.5" r="2.8" fill="currentColor" opacity="0.42" />
      </>,
      size
    );
  },
  // 3-circle triangle (Team / Settings)
  settings: function (size) {
    return svgWrap(
      <>
        <circle cx="0"  cy="-4" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="-4" cy="3"  r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4"  cy="3"  r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </>,
      size
    );
  },
  // Exclamation in a circle (Diagnostics)
  diagnostics: function (size) {
    return svgWrap(
      <>
        <circle cx="0" cy="0" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <line x1="0" y1="-3.5" x2="0" y2="1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="0" cy="4" r="0.95" fill="currentColor" />
      </>,
      size
    );
  },
  // Route path (Routes)
  routes: function (size) {
    return svgWrap(
      <>
        <circle cx="-5.5" cy="-4.5" r="1.4" fill="currentColor" />
        <path
          d="M -5.5 -4.5 L -5.5 0 L 5.5 0 L 5.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="5.5" cy="4.5" r="1.4" fill="currentColor" />
      </>,
      size
    );
  },
};

// Mobile uses the same accounts mark for the Workspaces tab so the
// label-tracks-active-workspace pattern still reads sensibly.
MARKS.workspaces = MARKS.accounts;
// Team nav reuses the three-circle mark (originally on Settings) since
// the glyph reads as "three people" cleanly. Settings will pick up a
// dedicated gear glyph separately.
MARKS.team = MARKS.settings;

export function NavMark({ id, size }) {
  var render = MARKS[id];
  if (!render) return null;
  return render(size);
}
