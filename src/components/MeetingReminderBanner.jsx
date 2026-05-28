import { C } from "../lib/colors";
import { PipMark } from "./PipMark";

var INTER = "'Inter', system-ui, sans-serif";

function toneFor(threshold) {
  if (threshold === "30m") {
    return {
      bg:         C.bgCard,
      border:     C.accentLine,
      barColor:   C.accentDim,
      ctaBg:      C.accentSubtle,
      ctaText:    C.accent,
      ctaBorder:  C.accentBorder,
      pipPulse:   false,
      label:      "Heads up",
      labelColor: C.textMuted,
    };
  }
  if (threshold === "5m") {
    return {
      bg:         C.bgCard,
      border:     C.yellow,
      barColor:   C.yellow,
      ctaBg:      C.yellowFaint,
      ctaText:    C.yellow,
      ctaBorder:  C.yellow,
      pipPulse:   true,
      label:      "5 min out",
      labelColor: C.yellow,
    };
  }
  // start
  return {
    bg:         C.bgCard,
    border:     C.accent,
    barColor:   C.accent,
    ctaBg:      C.accent,
    ctaText:    "#fff",
    ctaBorder:  C.accent,
    pipPulse:   true,
    label:      "Live now",
    labelColor: C.accent,
  };
}

function ctaLabelFor(threshold) {
  if (threshold === "start") return "Start meeting now →";
  return "Open hub";
}

function ReminderRow({ reminder, onOpen, onDismiss }) {
  var tone = toneFor(reminder.threshold);
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 16px 10px 14px",
        background: tone.bg,
        borderBottom: "1px solid " + C.rule,
        borderLeft: "4px solid " + tone.barColor,
        fontFamily: INTER,
        animation: "remindSlideDown 0.32s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <PipMark size={10} color={tone.barColor} glow pulse={tone.pipPulse} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: tone.labelColor,
          textTransform: "uppercase", letterSpacing: "0.09em",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        }}>
          {tone.label}
        </span>
      </div>

      <div style={{
        fontSize: 13, color: C.text, lineHeight: 1.4, flex: 1, minWidth: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {reminder.text}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button
          onClick={function () { onOpen(reminder); }}
          style={{
            background: tone.ctaBg,
            color: tone.ctaText,
            border: "1px solid " + tone.ctaBorder,
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12, fontWeight: 700,
            cursor: "pointer",
            fontFamily: INTER,
            whiteSpace: "nowrap",
          }}
        >
          {ctaLabelFor(reminder.threshold)}
        </button>
        <button
          onClick={function () { onDismiss(reminder.id); }}
          aria-label="Dismiss reminder"
          style={{
            background: "none", border: "none", color: C.textMuted,
            fontSize: 18, cursor: "pointer", padding: "4px 8px",
            lineHeight: 1, fontFamily: INTER,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function MeetingReminderBanner({ reminders, onDismiss, onOpen }) {
  if (!reminders || reminders.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes remindSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 180,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {reminders.map(function (r) {
          return (
            <ReminderRow
              key={r.id}
              reminder={r}
              onOpen={onOpen}
              onDismiss={onDismiss}
            />
          );
        })}
      </div>
    </>
  );
}
