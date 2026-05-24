import { C } from "../lib/colors";
import { FolioIcon } from "../components/FolioIcon";
import { GaugeIcon } from "../components/GaugeIcon";
import { PipMark } from "../components/PipMark";
import { AmberBtn } from "../components/Buttons";
import { UserMenu } from "../components/UserMenu";

var NAV_ITEMS = [
  { id: "accounts", label: "Accounts",  icon: "▣"  },
  { id: "meetings", label: "Meetings",  icon: "◷"  },
  { id: "pipeline", label: "Pipeline",  icon: "▦"  },
  { id: "cadence",  label: "Cadence",   icon: "↻"  },
  { id: "gauge",    label: "Gauge",     icon: "gauge" },
  { id: "pip",      label: "Pip",       icon: null },
];

export function DesktopLayout({
  view,
  setView,
  onAddAccount,
  onSignOut,
  onTour,
  userMeta,
  slideClass,
  accountsPane,
  detailPane,
  children,
}) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: C.bg,
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          background: C.bgDark,
          borderRight: "1px solid " + C.border,
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <FolioIcon size={28} />
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: C.text,
                letterSpacing: "0.02em",
                display: "flex",
                alignItems: "center",
                gap: 5,
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
              Account Mgmt
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {NAV_ITEMS.map(function (item) {
            var active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={function () { setView(item.id); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  background: active ? (item.id === "gauge" ? "rgba(123,108,246,0.08)" : C.bgPillActive) : "transparent",
                  color: active ? (item.id === "gauge" ? C.blue : C.accent) : C.textSub,
                  border: "1px solid " + (active ? (item.id === "gauge" ? "rgba(123,108,246,0.2)" : "rgba(74,155,130,0.2)") : "transparent"),
                  textAlign: "left",
                }}
              >
                {item.icon === "gauge" ? (
                  <GaugeIcon size={14} color={active ? C.blue : C.textMuted} />
                ) : item.icon ? (
                  <span style={{ fontSize: 13, opacity: 0.7 }}>{item.icon}</span>
                ) : (
                  <PipMark size={7} color={active ? C.accent : C.textMuted} pulse={active} />
                )}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Add Account button */}
        <AmberBtn
          onClick={onAddAccount}
          style={{ width: "100%", marginBottom: 12, fontSize: 12 }}
        >
          + Account
        </AmberBtn>

        {/* User menu */}
        <div style={{ borderTop: "1px solid " + C.border, paddingTop: 14, marginTop: 4 }}>
          <UserMenu userMeta={userMeta} onSignOut={onSignOut} onTour={onTour} dropUp />
        </div>
      </div>

      {/* Accounts list column (only for accounts view) */}
      {accountsPane && (
        <div
          style={{
            width: 320,
            flexShrink: 0,
            borderRight: "1px solid " + C.border,
            overflowY: "auto",
            padding: "20px 16px",
          }}
        >
          {accountsPane}
        </div>
      )}

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 32px",
        }}
      >
        <div key={view} className={slideClass || "view-fade-in"}>
          {detailPane || children}
        </div>
      </div>
    </div>
  );
}
