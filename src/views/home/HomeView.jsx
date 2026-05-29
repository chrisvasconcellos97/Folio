import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { LitPill } from "../../components/LitPill";
import { useBreakpoint } from "../../hooks/useBreakpoint";

var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function timeOfDayGreeting() {
  var h = new Date().getHours();
  if (h < 5)  return "Late, Chris.";
  if (h < 12) return "Morning, Chris.";
  if (h < 17) return "Afternoon, Chris.";
  if (h < 21) return "Evening, Chris.";
  return "Late, Chris.";
}

function dateLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function Panel({ id, title, subtitle, accent, children }) {
  return (
    <div style={{
      background: C.surface,
      border: "1px solid " + C.rule,
      borderRadius: 12,
      padding: "16px 18px",
      minHeight: 160,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, color: accent || C.textMuted,
          fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          {title}
        </div>
      </div>
      <div style={{
        fontFamily: INTER, fontSize: 12.5, color: C.textSoft,
        fontStyle: "italic", lineHeight: 1.4, marginTop: -4,
      }}>
        {subtitle}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children || (
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, opacity: 0.6 }}>
            empty for now
          </div>
        )}
      </div>
    </div>
  );
}

export function HomeView() {
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;
  var [mounted, setMounted] = useState(false);

  // Stagger-in: tiny delay so the panels feel like they assemble after the
  // hero lands. Theater level B from the brief.
  useEffect(function () {
    var t = setTimeout(function () { setMounted(true); }, 60);
    return function () { clearTimeout(t); };
  }, []);

  var burningPanel = (
    <Panel
      id="burning"
      title="Burning"
      subtitle="These need eyes."
      accent={C.red}
    />
  );
  var callsPanel = (
    <Panel
      id="calls"
      title="Today's Calls"
      subtitle="I'll prep you."
      accent={C.accent}
    />
  );
  var loosePanel = (
    <Panel
      id="loose"
      title="Loose Ends"
      subtitle="Let me clean these up."
      accent={C.yellow}
    />
  );
  var aheadPanel = (
    <Panel
      id="ahead"
      title="Ahead"
      subtitle="While you weren't looking."
      accent={C.accentDim || C.accent}
    />
  );

  // Mobile order: BURNING first per locked design.
  var mobileOrder    = [burningPanel, callsPanel, loosePanel, aheadPanel];
  var desktopOrder   = [callsPanel, burningPanel, loosePanel, aheadPanel];

  return (
    <div style={{ position: "relative", minHeight: "100%", paddingBottom: isMobile ? 80 : 32 }}>
      {/* Greeting */}
      <div style={{ padding: isMobile ? "16px 16px 0" : "28px 32px 0", textAlign: "center" }}>
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 26 : 34,
          color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1,
        }}>
          {timeOfDayGreeting()}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 10.5, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 6,
        }}>
          {dateLabel()}
        </div>
      </div>

      {/* Hero — orb + hero line + actions */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: isMobile ? 16 : 20,
        padding: isMobile ? "24px 16px 28px" : "32px 32px 36px",
      }}>
        <PipOrb size="xxl" sonar />
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 18 : 22,
          color: C.text, lineHeight: 1.45, letterSpacing: "-0.01em",
          textAlign: "center", maxWidth: 580,
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.2s",
        }}>
          {"Quiet morning. Nothing on fire — let's stay ahead."}
        </div>
        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.35s",
        }}>
          <LitPill onClick={function () {}}>
            Open brief →
          </LitPill>
          <LitPill onClick={function () {}}>
            Quick capture +
          </LitPill>
        </div>
      </div>

      {/* Panels — stagger in */}
      <div style={{
        padding: isMobile ? "0 12px 16px" : "0 32px 24px",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: isMobile ? 10 : 14,
        maxWidth: 980, margin: "0 auto",
      }}>
        {(isMobile ? mobileOrder : desktopOrder).map(function (panel, i) {
          return (
            <div
              key={i}
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(6px)",
                transition: "opacity 0.32s ease " + (0.45 + i * 0.08) + "s, transform 0.32s ease " + (0.45 + i * 0.08) + "s",
              }}
            >
              {panel}
            </div>
          );
        })}
      </div>

      {/* Mobile sticky quick-capture strip */}
      {isMobile && (
        <div style={{
          position: "fixed",
          left: 0, right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
          padding: "8px 12px",
          background: C.bg,
          borderTop: "1px solid " + C.rule,
          display: "flex", gap: 8, zIndex: 50,
        }}>
          <button
            onClick={function () {}}
            style={{
              flex: 1, background: C.surface,
              border: "1px solid " + C.rule, borderRadius: 8,
              padding: "11px 12px", color: C.textSoft,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Touchpoint
          </button>
          <button
            onClick={function () {}}
            style={{
              flex: 1, background: C.surface,
              border: "1px solid " + C.rule, borderRadius: 8,
              padding: "11px 12px", color: C.textSoft,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Task
          </button>
        </div>
      )}
    </div>
  );
}
