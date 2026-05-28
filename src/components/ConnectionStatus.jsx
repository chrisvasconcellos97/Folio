import { useEffect, useState } from "react";
import { C } from "../lib/colors";
import { subscribeRealtimeStatus } from "../hooks/useRealtimeSync";

// ─── Phase 8 — Multi-device realtime sync ───────────────────────────────────
// Discreet "Reconnecting…" indicator. Renders **nothing** while the realtime
// channels are healthy (or haven't yet attempted to connect) — only appears
// when one or more channels are in a broken state (closed / channel_error /
// timed_out).
//
// Positioned bottom-right by default. Tokenized colors so it reads in both
// themes (uses C.red for the dot, C.surface2 for the chip).
// ─────────────────────────────────────────────────────────────────────────────

var MONO = "'JetBrains Mono', ui-monospace, monospace";

export function ConnectionStatus() {
  var [broken, setBroken] = useState(false);

  useEffect(function () {
    var unsubscribe = subscribeRealtimeStatus(function (snapshot) {
      var keys = Object.keys(snapshot);
      var anySubscribed = false;
      var anyBroken = false;
      for (var i = 0; i < keys.length; i++) {
        var s = snapshot[keys[i]];
        if (s === "subscribed") anySubscribed = true;
        if (s === "closed" || s === "channel_error" || s === "timed_out") anyBroken = true;
      }
      // Only flag broken once we have *some* channel history. Idle-only
      // snapshots (during initial connect) shouldn't trip the indicator.
      setBroken(anyBroken && (anySubscribed || keys.length >= 2));
    });
    return unsubscribe;
  }, []);

  if (!broken) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "calc(20px + env(safe-area-inset-bottom))",
        right: 20,
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background: C.surface2,
        border: "1px solid " + C.rule,
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: C.textMuted,
        pointerEvents: "none",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: C.red,
          animation: "rt-pulse 1.4s ease-in-out infinite",
        }}
      />
      Reconnecting…
      <style>{
        "@keyframes rt-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }"
      }</style>
    </div>
  );
}
