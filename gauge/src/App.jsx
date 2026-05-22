import { useState } from "react";
import { C } from "./lib/colors";
import { useAuth } from "./hooks/useAuth";
import { useAccounts } from "./hooks/useAccounts";
import { GaugeIcon } from "./components/GaugeIcon";
import { AuthView } from "./views/auth/AuthView";
import { ProjectsView } from "./views/projects/ProjectsView";

var GB     = "rgba(103,200,249,0.10)";
var GB_BDR = "rgba(103,200,249,0.22)";

export function App() {
  var { session, loading, signIn, signOut } = useAuth();
  var userId   = session ? session.user.id : null;
  var accounts = useAccounts(userId);
  var [openAdd, setOpenAdd] = useState(false);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GaugeIcon size={36} glow />
      </div>
    );
  }

  if (!session) {
    return <AuthView onSignIn={signIn} />;
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: C.bg,
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: C.bgSidebar,
          borderRight: "1px solid " + C.border,
          display: "flex",
          flexDirection: "column",
          padding: "20px 0",
          overflowY: "auto",
        }}
      >
        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 18px 20px",
            borderBottom: "1px solid " + C.border,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: GB,
              border: "1px solid " + GB_BDR,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <GaugeIcon size={22} glow />
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.text,
                letterSpacing: "0.1em",
                lineHeight: 1,
              }}
            >
              GAUGE
            </div>
            <div
              style={{
                fontSize: 9,
                color: C.accent,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginTop: 3,
              }}
            >
              Project Management
            </div>
          </div>
        </div>

        {/* + New Project */}
        <div style={{ padding: "0 12px 16px" }}>
          <button
            onClick={function () { setOpenAdd(true); }}
            style={{
              width: "100%",
              background: GB,
              border: "1px solid " + GB_BDR,
              borderRadius: 8,
              padding: "9px 14px",
              color: C.accent,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            New Project
          </button>
        </div>

        {/* Nav item */}
        <nav style={{ padding: "0 8px", flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 10px",
              borderRadius: 8,
              background: GB,
              border: "1px solid " + GB_BDR,
              color: C.accent,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 2,
            }}
          >
            Projects
          </div>
        </nav>

        {/* User / sign out */}
        <div
          style={{
            padding: "16px 12px 0",
            borderTop: "1px solid " + C.border,
            marginTop: 16,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              marginBottom: 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {session.user.email}
          </div>
          <button
            onClick={signOut}
            style={{
              background: "none",
              border: "1px solid " + C.border,
              borderRadius: 7,
              padding: "7px 12px",
              color: C.textMuted,
              fontSize: 11,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 32px",
        }}
      >
        {/* Page header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              Projects
            </h1>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
              Track commitments and deliverables
            </div>
          </div>

          <button
            onClick={function () { setOpenAdd(true); }}
            style={{
              background: GB,
              border: "1px solid " + GB_BDR,
              borderRadius: 24,
              padding: "8px 20px",
              color: C.accent,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
            }}
          >
            + New Project
          </button>
        </div>

        <ProjectsView
          userId={userId}
          accounts={accounts}
          openAdd={openAdd}
          onAddClosed={function () { setOpenAdd(false); }}
        />
      </main>
    </div>
  );
}
