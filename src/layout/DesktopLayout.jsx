import { C } from "../lib/colors";
import { FolioIcon } from "../components/FolioIcon";
import { PipOrb } from "../components/PipMark";
import { Mark } from "../components/Mark";
import { AmberBtn } from "../components/Buttons";
import { LitPill } from "../components/LitPill";
import { UserMenu } from "../components/UserMenu";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { ModeToggle } from "../components/ModeToggle";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

var NAV_ITEMS = [
  { id: "home",        label: "Home",        icon: "◉"     },
  { id: "accounts",    label: "Accounts",    icon: "▣"     },
  { id: "__divider__", divider: true                       },
  { id: "meetings",    label: "Calendar",    icon: "◷"     },
  { id: "cadence",     label: "Cadence",     icon: "↻"     },
  { id: "commitments", label: "Commitments", icon: "✦"     },
  { id: "gauge",       label: "Gauge",       icon: "gauge" },
  { id: "pip",         label: "Pip",         icon: null    },
  { id: "team",        label: "Team",        icon: "◈"     },

];

export function DesktopLayout({
  view,
  setView,
  onAddAccount,
  onSignOut,
  onTour,
  userMeta,
  accountsPane,
  detailPane,
  children,
  diagnosticsCount,
  mode,
  onToggleMode,
}) {
  // Phase 6 — show Diagnostics nav only when there are unresolved errors in
  // the last 7 days. Keeps the sidebar quiet during normal operation.
  var navItems = NAV_ITEMS;
  if (diagnosticsCount > 0) {
    navItems = NAV_ITEMS.concat([{ id: "diagnostics", label: "Diagnostics", icon: "!", badge: diagnosticsCount }]);
  }
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: C.bg,
      }}
    >
      {/* Skip to content — visible only when focused via keyboard */}
      <a
        href="#main-content"
        className="skip-to-content"
        onClick={function (e) {
          e.preventDefault();
          var el = document.getElementById("main-content");
          if (el) { el.focus(); el.scrollIntoView(); }
        }}
      >
        Skip to content
      </a>
      {/* Rail — 232px. Background uses a token so light mode picks up Mist
          (var(--c-rail)) while dark mode keeps surface. */}
      <div
        className="app-rail"
        style={{
          width: 232,
          flexShrink: 0,
          background: "var(--c-rail-bg)",
          borderRight: "1px solid " + C.rule,
          display: "flex",
          flexDirection: "column",
          padding: "20px 14px",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <FolioIcon size={40} />
          <div>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 22,
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
                fontSize: 9,
                color: C.textFaint,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginTop: 1,
              }}
            >
              Account Mgmt
            </div>
          </div>
        </div>

        {/* Rule */}
        <div style={{ borderBottom: "1px solid " + C.rule, margin: "10px 0 14px" }} />

        {/* Section label */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            color: C.textFaint,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 6,
            paddingLeft: 4,
          }}
        >
          Workspace
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
          {navItems.map(function (item) {
            if (item.divider) {
              return (
                <div
                  key="__divider__"
                  style={{ borderBottom: "1px solid " + C.rule, margin: "8px 4px 8px" }}
                />
              );
            }
            var active = view === item.id;
            var isGauge = item.id === "gauge";
            var isPip   = item.id === "pip";
            return (
              <button
                key={item.id}
                onClick={function () { setView(item.id); }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "22px 1fr auto",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontWeight: active ? 500 : 400,
                  fontSize: 13.5,
                  background: active
                    ? (isGauge ? "rgba(91,143,212,0.1)" : "oklch(0.22 0.04 178 / 0.5)")
                    : "transparent",
                  color: active
                    ? (isGauge ? C.blue : C.accent)
                    : C.textSoft,
                  border: "1px solid " + (active
                    ? (isGauge ? "rgba(91,143,212,0.25)" : C.accentLine)
                    : "transparent"),
                  textAlign: "left",
                }}
              >
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, flexShrink: 0,
                  opacity: active ? 1 : 0.78,
                }}>
                  <Mark tab={item.id} size={22} active={active} />
                </span>

                {/* Label */}
                <span>{item.label}</span>

                {/* Active dot for Pip */}
                {isPip && active && (
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: C.accent, display: "inline-block",
                  }} />
                )}
                {item.badge ? (
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: C.red,
                    background: C.redFaint,
                    border: "1px solid " + C.redLine,
                    borderRadius: 10,
                    padding: "1px 7px",
                    minWidth: 18,
                    textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                  }}>{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Footer — lit-pill primary CTA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <LitPill
            onClick={onAddAccount}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {view === "departments" ? "Add Department" : view === "partners" ? "Add Partner" : "Add Account"}
          </LitPill>
          {onToggleMode && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ModeToggle mode={mode} onToggle={onToggleMode} />
            </div>
          )}
          <div style={{ borderTop: "1px solid " + C.rule, paddingTop: 10 }}>
            <UserMenu userMeta={userMeta} onSignOut={onSignOut} onTour={onTour} onSettings={function () { setView("settings"); }} dropUp />
          </div>
        </div>
      </div>

      {/* Accounts list column (only for accounts view) */}
      {accountsPane && (
        <div
          style={{
            width: 400,
            flexShrink: 0,
            borderRight: "1px solid " + C.rule,
            overflowY: "auto",
            padding: "20px 14px",
          }}
        >
          {accountsPane}
        </div>
      )}

      {/* Main content */}
      <main
        id="main-content"
        tabIndex={-1}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 32px",
          outline: "none",
        }}
      >
        <div key={view} className="view-fade-in">
          {detailPane || children}
        </div>
      </main>
      <ConnectionStatus />
    </div>
  );
}
