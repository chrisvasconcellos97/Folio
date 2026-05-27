import { useEffect, useRef } from "react";
import { C } from "../lib/colors";
import { FolioIcon } from "../components/FolioIcon";
import { GaugeIcon } from "../components/GaugeIcon";
import { PipOrb } from "../components/PipMark";
import { AmberBtn } from "../components/Buttons";
import { UserMenu } from "../components/UserMenu";
import { FirstRunTooltip } from "../components/Tooltip";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

var TOOLTIP_TIPS = {
  cadence: "Set recurring meeting schedules so you never lose track of an account.",
  gauge:   "Track projects and commitments tied to your accounts.",
  pip:     "Your AI field analyst — ask anything about your accounts.",
};

var NAV_ITEMS = [
  { id: "accounts", label: "Accounts", icon: "▣"     },
  { id: "meetings", label: "Meetings", icon: "◷"     },
  { id: "pipeline", label: "Pipeline", icon: "▦"     },
  { id: "cadence",  label: "Cadence",  icon: "↻"     },
  { id: "gauge",    label: "Gauge",    icon: "gauge"  },
  { id: "routes",   label: "Route",    icon: "⊕"     },
];

export function MobileLayout({ view, setView, onAddAccount, onSignOut, onTour, onSettings, userMeta, children }) {
  var scrollRef = useRef(null);

  useEffect(function () {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: C.bg,
      }}
    >
      {/* Mobile header */}
      <div
        style={{
          background: C.surface,
          borderBottom: "1px solid " + C.rule,
          padding: "max(14px, env(safe-area-inset-top)) 18px 12px",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FolioIcon size={32} />
            <div>
              <div
                style={{
                  fontFamily: SERIF,
                  fontSize: 18,
                  fontWeight: 400,
                  color: C.text,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                }}
              >
                Folios
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 8,
                  color: C.textFaint,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginTop: 1,
                }}
              >
                Account Management
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AmberBtn onClick={onAddAccount} style={{ fontSize: 11, padding: "6px 13px" }}>
              + Account
            </AmberBtn>
            <UserMenu userMeta={userMeta} onSignOut={onSignOut} onTour={onTour} onSettings={onSettings} />
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px calc(74px + env(safe-area-inset-bottom))",
        }}
      >
        <div key={view} className="view-fade-in">
          {children}
        </div>
      </div>

      {/* Bottom nav */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: C.surface,
          borderTop: "1px solid " + C.rule,
          padding: "8px 16px max(12px, env(safe-area-inset-bottom))",
          zIndex: 50,
        }}
      >
        <div
          style={{
            display: "flex",
            background: "rgba(0,0,0,0.2)",
            borderRadius: 10,
            padding: 3,
            gap: 2,
          }}
        >
          {NAV_ITEMS.map(function (item) {
            var active = view === item.id;
            var isGauge = item.id === "gauge";
            var btn = (
              <button
                key={item.id}
                onClick={function () { setView(item.id); }}
                style={{
                  flex: 1,
                  padding: "10px 6px",
                  borderRadius: 8,
                  cursor: "pointer",
                  userSelect: "none",
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  background: active ? C.surface2 : "transparent",
                  color: active ? (isGauge ? C.blue : C.accent) : C.textMuted,
                  border: "1px solid " + (active ? C.rule : "transparent"),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                {isGauge ? (
                  <GaugeIcon size={14} color={active ? C.blue : C.textMuted} />
                ) : item.icon ? (
                  <span style={{ fontSize: 13 }}>{item.icon}</span>
                ) : (
                  <PipOrb size="xs" />
                )}
                {item.label}
              </button>
            );
            if (TOOLTIP_TIPS[item.id]) {
              return (
                <FirstRunTooltip key={item.id} id={item.id} text={TOOLTIP_TIPS[item.id]}>
                  {btn}
                </FirstRunTooltip>
              );
            }
            return btn;
          })}
        </div>
      </div>
    </div>
  );
}
