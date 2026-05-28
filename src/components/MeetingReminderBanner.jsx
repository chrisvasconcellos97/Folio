import { C } from "../lib/colors";
import { PipMark } from "./PipMark";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

var PRIORITY = { start: 0, "5m": 1, "30m": 2 };

function toneFor(threshold) {
  if (threshold === "30m") {
    return {
      barColor:  C.accent,
      ctaBg:     C.accentSubtle,
      ctaText:   C.accent,
      ctaBorder: C.accentBorder,
      pipPulse:  false,
      label:     "Heads up",
      labelColor: C.textMuted,
    };
  }
  if (threshold === "5m") {
    return {
      barColor:  C.yellow,
      ctaBg:     C.yellowFaint,
      ctaText:   C.yellow,
      ctaBorder: C.yellow,
      pipPulse:  true,
      label:     "5 min out",
      labelColor: C.yellow,
    };
  }
  return {
    barColor:  C.accent,
    ctaBg:     C.accent,
    ctaText:   "#fff",
    ctaBorder: C.accent,
    pipPulse:  true,
    label:     "Live now",
    labelColor: C.accent,
  };
}

function ctaLabelFor(threshold) {
  if (threshold === "start") return "Start meeting →";
  return "Open hub";
}

function pickActive(reminders) {
  return reminders.slice().sort(function (a, b) {
    var pa = PRIORITY[a.threshold] != null ? PRIORITY[a.threshold] : 99;
    var pb = PRIORITY[b.threshold] != null ? PRIORITY[b.threshold] : 99;
    if (pa !== pb) return pa - pb;
    return (b.firedAt || 0) - (a.firedAt || 0);
  })[0];
}

export function MeetingReminderBanner({ reminders, onDismiss, onOpen }) {
  if (!reminders || reminders.length === 0) return null;
  var r = pickActive(reminders);
  if (!r) return null;

  var tone = toneFor(r.threshold);

  return (
    <>
      <style>{`
        @keyframes remindPillIn {
          from { transform: translate(-50%, -16px); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
        @keyframes remindPillGlow {
          0%, 100% { box-shadow: 0 0 0 1px ${tone.barColor}33, 0 8px 28px ${tone.barColor}26, 0 2px 8px rgba(0,0,0,0.25); }
          50%      { box-shadow: 0 0 0 1px ${tone.barColor}55, 0 10px 36px ${tone.barColor}40, 0 2px 8px rgba(0,0,0,0.25); }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          top: 14,
          left: "50%",
          zIndex: 180,
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          padding: "7px 8px 7px 14px",
          background: C.bgCard,
          border: "1px solid " + tone.barColor + "55",
          borderRadius: 999,
          maxWidth: "calc(100vw - 24px)",
          fontFamily: INTER,
          animation: "remindPillIn 0.32s ease, remindPillGlow 2.6s ease-in-out infinite",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <PipMark size={9} color={tone.barColor} glow pulse={tone.pipPulse} />
          <span style={{
            fontSize: 9.5, fontWeight: 700, color: tone.labelColor,
            textTransform: "uppercase", letterSpacing: "0.09em",
            fontFamily: MONO, whiteSpace: "nowrap",
          }}>
            {tone.label}
          </span>
        </div>

        <div style={{
          fontSize: 12.5, color: C.text, lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: 360,
        }}>
          {r.text}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            onClick={function () { onOpen(r); }}
            style={{
              background: tone.ctaBg,
              color: tone.ctaText,
              border: "1px solid " + tone.ctaBorder,
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 11.5, fontWeight: 700,
              cursor: "pointer",
              fontFamily: INTER,
              whiteSpace: "nowrap",
            }}
          >
            {ctaLabelFor(r.threshold)}
          </button>
          <button
            onClick={function () { onDismiss(r.id); }}
            aria-label="Dismiss reminder"
            style={{
              background: "none", border: "none", color: C.textMuted,
              fontSize: 16, cursor: "pointer", padding: "2px 8px",
              lineHeight: 1, fontFamily: INTER, borderRadius: 999,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </>
  );
}
