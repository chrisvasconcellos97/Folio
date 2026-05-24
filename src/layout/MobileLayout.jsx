import { useEffect, useRef } from "react";
import { C } from "../lib/colors";
import { FolioIcon } from "../components/FolioIcon";
import { GaugeIcon } from "../components/GaugeIcon";
import { PipMark } from "../components/PipMark";
import { AmberBtn } from "../components/Buttons";
import { UserMenu } from "../components/UserMenu";

var NAV_ITEMS = [
  { id: "accounts", label: "Accounts", icon: "▣"     },
  { id: "meetings", label: "Meetings", icon: "◷"     },
  { id: "pipeline", label: "Pipeline", icon: "▦"     },
  { id: "cadence",  label: "Cadence",  icon: "↻"     },
  { id: "gauge",    label: "Gauge",    icon: "gauge"  },
];

export function MobileLayout({ view, setView, slideClass, onAddAccount, onSignOut, onTour, userMeta, children }) {
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
          background: C.bg,
          borderBottom: "1px solid " + C.border,
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
            <FolioIcon size={24} />
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 15,
                  fontWeight: 600,
                  color: C.text,
                }}
              >
                Folio
                <PipMark size={6} color={C.accent} opacity={0.5} />
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: C.textMuted,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
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
            <UserMenu userMeta={userMeta} onSignOut={onSignOut} onTour={onTour} />
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
        <div key={view} className={slideClass || "view-fade-in"}>
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
          background: C.bgDark,
          borderTop: "1px solid " + C.border,
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
            return (
              <button
                key={item.id}
                onClick={function () { setView(item.id); }}
                style={{
                  flex: 1,
                  padding: "10px 6px",
                  borderRadius: 8,
                  cursor: "pointer",
                  userSelect: "none",
                  fontSize: 9,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  background: active ? C.bgCardAlt : "transparent",
                  color: active ? (item.id === "gauge" ? C.blue : C.accent) : C.textMuted,
                  border: "1px solid " + (active ? C.border : "transparent"),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                {item.icon === "gauge" ? (
                  <GaugeIcon size={14} color={active ? C.blue : C.textMuted} />
                ) : item.icon ? (
                  <span style={{ fontSize: 13 }}>{item.icon}</span>
                ) : (
                  <PipMark size={8} color={active ? C.accent : C.textMuted} pulse={active} />
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
