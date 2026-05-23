import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";

var GREETINGS = [
  function (n, items, accounts) {
    return "Welcome back, " + n + ". " + items + " open item" + (items !== 1 ? "s" : "") + " still waiting. They didn't go anywhere.";
  },
  function (n, items, accounts, days) {
    var prefix = days > 1 ? days + " days away, " : days === 1 ? "One day away, " : "Back already, ";
    return prefix + n + ". " + items + " thing" + (items !== 1 ? "s" : "") + " piled up. Not panicking. Just noting it.";
  },
  function (n, items, accounts) {
    return "Back again, " + n + ". " + accounts + " account" + (accounts !== 1 ? "s" : "") + ", " + items + " open item" + (items !== 1 ? "s" : "") + ". Everything's more or less where you left it.";
  },
  function (n, items, accounts) {
    return "Oh good, " + n + "'s here. " + accounts + " account" + (accounts !== 1 ? "s" : "") + ". " + items + " open item" + (items !== 1 ? "s" : "") + ". The usual.";
  },
  function (n, items, accounts) {
    return "You're back. " + accounts + " account" + (accounts !== 1 ? "s" : "") + " counting on you, " + n + ". No pressure. Some pressure.";
  },
];

export function ReturningWelcome({ userId, userName, accountCount, onDismiss }) {
  var [openItems, setOpenItems]     = useState(null);
  var [days, setDays]               = useState(0);
  var [visible, setVisible]         = useState(false);
  var [greetingIdx, setGreetingIdx] = useState(0);

  useEffect(function () {
    var key      = "folio_last_seen_" + userId;
    var lastSeen = localStorage.getItem(key);
    if (lastSeen) {
      var d = Math.floor((Date.now() - parseInt(lastSeen, 10)) / 86400000);
      setDays(d);
    }
    localStorage.setItem(key, Date.now().toString());

    setGreetingIdx(new Date().getDay() % GREETINGS.length);

    supabase
      .from("folio_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("done", false)
      .then(function (result) {
        setOpenItems(result.count !== null ? result.count : 0);
        setTimeout(function () { setVisible(true); }, 30);
      });
  }, [userId]);

  var firstName = (userName || "").split(" ")[0] || "there";
  var loaded    = openItems !== null;
  var greeting  = loaded
    ? GREETINGS[greetingIdx](firstName, openItems, accountCount, days)
    : null;

  return (
    <div
      onClick={loaded ? onDismiss : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: C.bgDark,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 32px",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s",
        cursor: loaded ? "pointer" : "default",
      }}
    >
      {/* Pip orb */}
      <div style={{
        position: "relative",
        width: 80, height: 80,
        marginBottom: 40,
        animation: "pipFloat 3s ease-in-out infinite",
      }}>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          width: 80, height: 80, borderRadius: "50%",
          border: "1px solid rgba(74,155,130,0.3)",
          animation: "tourSonar 3s ease-out infinite",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          width: 80, height: 80, borderRadius: "50%",
          border: "1px solid rgba(74,155,130,0.3)",
          animation: "tourSonar 3s ease-out 1.5s infinite",
          pointerEvents: "none",
        }} />
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "rgba(74,155,130,0.1)",
          border: "1px solid rgba(74,155,130,0.4)",
          boxShadow: "0 0 32px rgba(74,155,130,0.28)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <PipMark size={18} color={C.accent} glow />
        </div>
      </div>

      {/* Greeting */}
      <div style={{
        fontSize: 18, fontWeight: 600, color: C.text,
        textAlign: "center", lineHeight: 1.6,
        maxWidth: 300, minHeight: 80,
      }}>
        {greeting}
      </div>

      {/* Tap hint */}
      {loaded && (
        <div style={{
          position: "absolute", bottom: "14%",
          fontSize: 11, color: C.textMuted,
          letterSpacing: "0.12em", textTransform: "uppercase",
          animation: "tapPulse 2s ease-in-out infinite",
        }}>
          Tap to continue
        </div>
      )}
    </div>
  );
}
