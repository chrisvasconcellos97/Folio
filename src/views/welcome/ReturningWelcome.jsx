import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SANS = "'Inter', system-ui, sans-serif";

var GREETINGS = [
  function (n, items, accounts) {
    return { em: "Back already, " + n + ".", rest: " " + items + " open item" + (items !== 1 ? "s" : "") + " still waiting. They didn't go anywhere." };
  },
  function (n, items, accounts, days) {
    var prefix = days > 1 ? days + " days away, " + n + "." : days === 1 ? "One day away, " + n + "." : "Back already, " + n + ".";
    return { em: prefix, rest: " " + items + " thing" + (items !== 1 ? "s" : "") + " piled up. Not panicking. Just noting it." };
  },
  function (n, items, accounts) {
    return { em: "Back again, " + n + ".", rest: " " + accounts + " account" + (accounts !== 1 ? "s" : "") + ", " + items + " open item" + (items !== 1 ? "s" : "") + ". Everything's more or less where you left it." };
  },
  function (n, items, accounts) {
    return { em: "Oh good, " + n + "'s here.", rest: " " + accounts + " account" + (accounts !== 1 ? "s" : "") + ". " + items + " open item" + (items !== 1 ? "s" : "") + ". The usual." };
  },
  function (n, items, accounts) {
    return { em: "You're back.", rest: " " + accounts + " account" + (accounts !== 1 ? "s" : "") + " counting on you, " + n + ". No pressure. Some pressure." };
  },
];

function buildPileItems(openItemCount) {
  // Generate pile preview items from open item count
  var items = [];
  if (openItemCount > 0) {
    items.push({ tag: "TASKS", name: openItemCount + " open item" + (openItemCount !== 1 ? "s" : ""), age: "open", severity: "warn" });
  }
  return items;
}

function fmtTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function ReturningWelcome({ userId, userName, accountCount, onDismiss }) {
  var [openItems, setOpenItems]     = useState(null);
  var [days, setDays]               = useState(0);
  var [awayMins, setAwayMins]       = useState(0);
  var [visible, setVisible]         = useState(false);
  var [greetingIdx, setGreetingIdx] = useState(0);

  useEffect(function () {
    var key      = "folio_last_seen_" + userId;
    var lastSeen = localStorage.getItem(key);
    if (lastSeen) {
      var elapsed = Date.now() - parseInt(lastSeen, 10);
      var d = Math.floor(elapsed / 86400000);
      var m = Math.floor(elapsed / 60000);
      setDays(d);
      setAwayMins(m);
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

  useEffect(function () {
    function onKey() { if (openItems !== null) onDismiss(); }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, [openItems, onDismiss]);

  var firstName = (userName || "").split(" ")[0] || "there";
  var loaded    = openItems !== null;
  var greeting  = loaded ? GREETINGS[greetingIdx](firstName, openItems, accountCount, days) : null;
  var pileItems = loaded ? buildPileItems(openItems) : [];
  var backAt    = fmtTime(new Date());
  var awayLabel = awayMins < 1 ? "just now" : awayMins < 60 ? awayMins + " min" : Math.floor(awayMins / 60) + "h " + (awayMins % 60) + "m";

  var SEVERITY_COLORS = { alert: C.red, warn: C.yellow, attn: C.accent };

  return (
    <div
      onClick={loaded ? onDismiss : undefined}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "radial-gradient(ellipse at center, oklch(0.18 0.04 178 / 0.25) 0%, transparent 60%), #07100f",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 32px",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s",
        cursor: loaded ? "pointer" : "default",
      }}
    >
      <div
        style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 28,
          maxWidth: 640, width: "100%",
        }}
      >
        {/* Pip orb — xxl, sonar, drifting + pulsing on away screen */}
        <PipOrb size="xxl" sonar className="drift" />

        {/* Away meta line */}
        <div style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: C.textFaint,
        }}>
          {loaded ? "Away · " + awayLabel + " · Back at " + backAt : "Loading…"}
        </div>

        {/* Greeting */}
        {greeting && (
          <div style={{
            fontFamily: SANS,
            fontSize: 26,
            fontWeight: 400,
            color: C.text,
            textAlign: "center",
            lineHeight: 1.5,
            maxWidth: "36ch",
            textWrap: "balance",
          }}>
            <span style={{ color: C.accent, fontWeight: 500 }}>{greeting.em}</span>
            {greeting.rest}
          </div>
        )}

        {/* Pile preview */}
        {pileItems.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            {pileItems.slice(0, 3).map(function (item, i) {
              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "88px 1fr auto",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderRadius: 6,
                  background: "oklch(0.16 0.02 178 / 0.4)",
                  border: "1px solid " + C.rule,
                  gap: 12,
                }}>
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: SEVERITY_COLORS[item.severity] || C.accent,
                  }}>
                    {item.tag}
                  </span>
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: C.text,
                  }}>
                    {item.name}
                  </span>
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    color: C.textFaint,
                  }}>
                    {item.age}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Continue pill */}
        {loaded && (
          <button
            onClick={onDismiss}
            style={{
              padding: "10px 28px",
              borderRadius: 999,
              fontFamily: MONO,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              background: "transparent",
              color: C.accent,
              border: "1px solid " + C.accentBorder,
              cursor: "pointer",
              animation: "tapGlow 2.6s ease-in-out infinite",
            }}
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
