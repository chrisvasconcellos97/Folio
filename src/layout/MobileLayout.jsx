import { useEffect, useRef, useState } from "react";
import { C } from "../lib/colors";
import { FolioIcon } from "../components/FolioIcon";
import { GaugeIcon } from "../components/GaugeIcon";
import { PipOrb } from "../components/PipMark";
import { AmberBtn } from "../components/Buttons";
import { UserMenu } from "../components/UserMenu";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { Mark } from "../components/Mark";
import { FirstRunTooltip } from "../components/Tooltip";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

var TOOLTIP_TIPS = {
  cadence: "Set recurring meeting schedules so you never lose track of an account.",
  gauge:   "Track projects and commitments tied to your accounts.",
  pip:     "Your AI field analyst — ask anything about your accounts.",
};

var WORKSPACE_IDS = ["accounts", "departments", "partners"];
var WORKSPACE_LABELS = { accounts: "Accounts", departments: "Departments", partners: "Partners" };

var NAV_ITEMS = [
  { id: "home",       label: "Home",       icon: "◉"     },
  { id: "workspaces", label: "Accounts",   icon: "▣",  isWorkspaces: true },
  { id: "meetings",   label: "Calendar",   icon: "◷"     },
  { id: "gauge",      label: "Gauge",      icon: "gauge"  },
];

export function MobileLayout({ view, setView, onAddAccount, onSignOut, onTour, onSettings, onDiagnostics, diagnosticsCount, userMeta, children }) {
  var scrollRef = useRef(null);
  var [wsOpen, setWsOpen] = useState(false);
  var isWorkspaceView = WORKSPACE_IDS.indexOf(view) !== -1;

  useEffect(function () {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [view]);

  useEffect(function () {
    if (!isWorkspaceView) setWsOpen(false);
  }, [view, isWorkspaceView]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: C.bg,
      }}
    >
      {/* Mobile header — Mist in light mode via --c-rail-bg token */}
      <div
        className="app-rail"
        style={{
          background: "var(--c-rail-bg)",
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
            <AmberBtn onClick={onAddAccount} style={{ fontSize: 10, padding: "5px 10px" }}>
              {view === "departments" ? "+ Dept" : view === "partners" ? "+ Partner" : "+ Account"}
            </AmberBtn>
            <UserMenu userMeta={userMeta} onSignOut={onSignOut} onTour={onTour} onSettings={onSettings} onDiagnostics={onDiagnostics} diagnosticsCount={diagnosticsCount} />
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

      {/* Workspaces popover */}
      {wsOpen && (
        <>
          <div
            onClick={function () { setWsOpen(false); }}
            style={{
              position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.35)",
            }}
          />
          <div
            role="menu"
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              bottom: "calc(74px + env(safe-area-inset-bottom))",
              background: C.surface,
              border: "1px solid " + C.rule,
              borderRadius: 12,
              padding: 8,
              zIndex: 60,
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div style={{
              fontFamily: MONO, fontSize: 9, color: C.textFaint,
              letterSpacing: "0.1em", textTransform: "uppercase",
              padding: "6px 10px 4px",
            }}>
              Workspaces
            </div>
            {WORKSPACE_IDS.map(function (id) {
              var active = view === id;
              return (
                <button
                  key={id}
                  role="menuitem"
                  onClick={function () { setWsOpen(false); setView(id); }}
                  style={{
                    background: active ? C.accentFaint : "transparent",
                    border: "1px solid " + (active ? C.accentLine : "transparent"),
                    borderRadius: 8,
                    padding: "11px 12px",
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: 14,
                    color: active ? C.accent : C.textSoft,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {WORKSPACE_LABELS[id]}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom nav — Mist in light mode via --c-rail-bg token */}
      <div
        className="app-rail"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--c-rail-bg)",
          borderTop: "1px solid " + C.rule,
          padding: "8px 16px max(12px, env(safe-area-inset-bottom))",
          zIndex: 50,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 0,
          }}
        >
          {NAV_ITEMS.map(function (item) {
            var isWorkspaces = !!item.isWorkspaces;
            var active = isWorkspaces ? isWorkspaceView : view === item.id;
            var isGauge = item.id === "gauge";
            var displayLabel = isWorkspaces && isWorkspaceView
              ? WORKSPACE_LABELS[view]
              : item.label;
            var btn = (
              <button
                key={item.id}
                onClick={function () {
                  if (isWorkspaces) {
                    if (isWorkspaceView) {
                      setWsOpen(function (o) { return !o; });
                    } else {
                      setView("accounts");
                    }
                    return;
                  }
                  setWsOpen(false);
                  setView(item.id);
                }}
                style={{
                  flex: 1,
                  height: 52,
                  padding: "6px 6px",
                  cursor: "pointer",
                  userSelect: "none",
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  background: "transparent",
                  color: active ? (isGauge ? C.blue : C.accent) : C.textMuted,
                  border: "none",
                  borderTop: "2px solid " + (active ? (isGauge ? C.blue : C.accent) : "transparent"),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                }}
                aria-expanded={isWorkspaces ? wsOpen : undefined}
                aria-haspopup={isWorkspaces ? "menu" : undefined}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, flexShrink: 0,
                  opacity: active ? 1 : 0.78,
                }}>
                  <Mark tab={item.id} size={22} active={active} />
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, lineHeight: 1 }}>
                  {displayLabel}
                  {isWorkspaces && (
                    <span style={{ fontSize: 7, opacity: 0.7 }}>{wsOpen ? "▾" : "▴"}</span>
                  )}
                </span>
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
      <ConnectionStatus />
    </div>
  );
}
