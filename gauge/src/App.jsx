import { useState, useEffect, useRef } from "react";
import { C } from "./lib/colors";
import { useAuth } from "./hooks/useAuth";
import { useAccounts } from "./hooks/useAccounts";
import { useProjects } from "./hooks/useProjects";
import { GaugeIcon } from "./components/GaugeIcon";
import { PipMark } from "./components/PipMark";
import { UserMenu } from "./components/UserMenu";
import { AuthView } from "./views/auth/AuthView";
import { ProjectsView } from "./views/projects/ProjectsView";
import { PipView } from "./views/pip/PipView";
import { OnboardingTour } from "./views/welcome/OnboardingTour";
import { ReturningWelcome } from "./views/welcome/ReturningWelcome";

var GB     = "rgba(103,200,249,0.10)";
var GB_BDR = "rgba(103,200,249,0.22)";

function useBreakpoint() {
  var [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  useEffect(function () {
    function handleResize() { setIsDesktop(window.innerWidth >= 768); }
    window.addEventListener("resize", handleResize);
    return function () { window.removeEventListener("resize", handleResize); };
  }, []);
  return isDesktop;
}

export function App() {
  var { session, loading, signIn, signOut } = useAuth();
  var userId    = session ? session.user.id : null;
  var userMeta  = session ? session.user.user_metadata : null;
  var accounts  = useAccounts(userId);
  var isDesktop = useBreakpoint();

  var { projects, loading: projLoading, addProject, updateProject, deleteProject } = useProjects(userId);

  var [view, setView]                     = useState("projects");
  var [openAdd, setOpenAdd]               = useState(false);
  var [showOnboarding, setOnboarding]     = useState(false);
  var [showReturning, setReturning]       = useState(false);
  var welcomeShown                        = useRef(false);

  function replayTour() { setReturning(false); setOnboarding(true); }

  useEffect(function () {
    if (!session || welcomeShown.current) return;
    welcomeShown.current = true;
    var uid         = session.user.id;
    var onboarded   = localStorage.getItem("gauge_onboarded_" + uid);
    var createdAt   = new Date(session.user.created_at);
    var featureDate = new Date("2026-05-22T00:00:00Z");
    var isNewUser   = createdAt >= featureDate;
    if (!onboarded && isNewUser) {
      setOnboarding(true);
    } else {
      if (!onboarded) localStorage.setItem("gauge_onboarded_" + uid, "true");
      setReturning(true);
    }
  }, [session]);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: C.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <GaugeIcon size={36} glow />
      </div>
    );
  }

  if (!session) return <AuthView onSignIn={signIn} />;

  var pipBtn = view !== "pip" && (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 90 }}>
      <div
        className="pip-sonar"
        onClick={function () { setView("pip"); }}
        style={{
          width: 52, height: 52, borderRadius: "50%",
          background: GB,
          border: "1px solid rgba(103,200,249,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 0 20px rgba(103,200,249,0.22)",
        }}
      >
        <PipMark size={14} color={C.accent} glow pulse />
      </div>
    </div>
  );

  var overlays = (
    <>
      {showOnboarding && (
        <OnboardingTour onComplete={function () {
          localStorage.setItem("gauge_onboarded_" + userId, "true");
          setOnboarding(false);
        }} />
      )}
      {!showOnboarding && showReturning && (
        <ReturningWelcome
          userId={userId}
          userName={userMeta ? userMeta.full_name : ""}
          onDismiss={function () { setReturning(false); }}
        />
      )}
    </>
  );

  var mainContent = view === "pip"
    ? (
      <PipView
        projects={projects}
        accounts={accounts}
        addProject={addProject}
        updateProject={updateProject}
        onBack={function () { setView("projects"); }}
      />
    )
    : (
      <ProjectsView
        projects={projects}
        loading={projLoading}
        accounts={accounts}
        openAdd={openAdd}
        onAddClosed={function () { setOpenAdd(false); }}
        addProject={addProject}
        updateProject={updateProject}
        deleteProject={deleteProject}
      />
    );

  /* ── Mobile ─────────────────────────────────────────────────── */
  if (!isDesktop) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg }}>
          <div style={{
            background: C.bgSidebar, borderBottom: "1px solid " + C.border,
            padding: "14px 18px 12px", position: "sticky", top: 0, zIndex: 50,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div
              onClick={function () { setView("projects"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: GB, border: "1px solid " + GB_BDR,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <GaugeIcon size={18} glow />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: "0.1em", lineHeight: 1 }}>GAUGE</div>
                <div style={{ fontSize: 8, color: C.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 2 }}>Project Management</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {view !== "pip" && (
                <button
                  onClick={function () { setOpenAdd(true); }}
                  style={{
                    background: GB, border: "1px solid " + GB_BDR,
                    borderRadius: 20, padding: "7px 14px",
                    color: C.accent, fontSize: 12, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                  }}
                >
                  + New
                </button>
              )}
              <UserMenu userMeta={userMeta} onSignOut={signOut} onTour={replayTour} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 100px" }}>
            {mainContent}
          </div>
        </div>
        {pipBtn}
        {overlays}
      </>
    );
  }

  /* ── Desktop ────────────────────────────────────────────────── */
  return (
    <>
      <div style={{ display: "flex", height: "100vh", background: C.bg, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside style={{
          width: 220, flexShrink: 0,
          background: C.bgSidebar, borderRight: "1px solid " + C.border,
          display: "flex", flexDirection: "column",
          padding: "20px 0", overflowY: "auto",
        }}>
          {/* Brand */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "0 18px 20px",
            borderBottom: "1px solid " + C.border, marginBottom: 16,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: GB, border: "1px solid " + GB_BDR,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <GaugeIcon size={22} glow />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: "0.1em", lineHeight: 1 }}>GAUGE</div>
              <div style={{ fontSize: 9, color: C.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 3 }}>Project Management</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ padding: "0 8px", flex: 1 }}>
            {[
              { id: "projects", label: "Projects" },
              { id: "pip",      label: "Pip",      isPip: true },
            ].map(function (item) {
              var active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={function () { setView(item.id); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 8, marginBottom: 2,
                    cursor: "pointer", textAlign: "left",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    background: active ? GB : "transparent",
                    border: "1px solid " + (active ? GB_BDR : "transparent"),
                    color: active ? C.accent : C.textSub,
                  }}
                >
                  {item.isPip
                    ? <PipMark size={7} color={active ? C.accent : C.textMuted} pulse={active} />
                    : <span style={{ fontSize: 13, opacity: 0.7 }}>▦</span>
                  }
                  {item.label}
                </button>
              );
            })}

            {/* + New Project (only on projects view) */}
            {view === "projects" && (
              <button
                onClick={function () { setOpenAdd(true); }}
                style={{
                  width: "100%", background: GB, border: "1px solid " + GB_BDR,
                  borderRadius: 8, padding: "9px 14px", marginTop: 8,
                  color: C.accent, fontSize: 12, fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                  textAlign: "left", display: "flex", alignItems: "center", gap: 7,
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                New Project
              </button>
            )}
          </nav>

          {/* User menu */}
          <div style={{ padding: "16px 12px 0", borderTop: "1px solid " + C.border, marginTop: 16 }}>
            <UserMenu userMeta={userMeta} onSignOut={signOut} onTour={replayTour} dropUp />
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          {view === "projects" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.1, margin: 0 }}>Projects</h1>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>Track commitments and deliverables</div>
              </div>
              <button
                onClick={function () { setOpenAdd(true); }}
                style={{
                  background: GB, border: "1px solid " + GB_BDR,
                  borderRadius: 24, padding: "8px 20px",
                  color: C.accent, fontSize: 12, fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                }}
              >
                + New Project
              </button>
            </div>
          )}
          {mainContent}
        </main>
      </div>

      {pipBtn}
      {overlays}
    </>
  );
}
