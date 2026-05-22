import { useState, useEffect, useRef } from "react";
import { C } from "./lib/colors";
import { useAuth } from "./hooks/useAuth";
import { useAccounts } from "./hooks/useAccounts";
import { GaugeIcon } from "./components/GaugeIcon";
import { UserMenu } from "./components/UserMenu";
import { AuthView } from "./views/auth/AuthView";
import { ProjectsView } from "./views/projects/ProjectsView";
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

  var [openAdd, setOpenAdd]           = useState(false);
  var [showOnboarding, setOnboarding] = useState(false);
  var [showReturning, setReturning]   = useState(false);
  var welcomeShown                    = useRef(false);

  function replayTour() {
    setReturning(false);
    setOnboarding(true);
  }

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

  if (!session) {
    return <AuthView onSignIn={signIn} />;
  }

  /* ── Mobile layout ─────────────────────────────────────────── */
  if (!isDesktop) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: C.bg }}>
          {/* Header */}
          <div style={{
            background: C.bgSidebar,
            borderBottom: "1px solid " + C.border,
            padding: "14px 18px 12px",
            position: "sticky", top: 0, zIndex: 50,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              <UserMenu userMeta={userMeta} onSignOut={signOut} onTour={replayTour} />
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 40px" }}>
            <ProjectsView
              userId={userId}
              accounts={accounts}
              openAdd={openAdd}
              onAddClosed={function () { setOpenAdd(false); }}
            />
          </div>
        </div>

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
  }

  /* ── Desktop layout ────────────────────────────────────────── */
  return (
    <>
      <div style={{ display: "flex", height: "100vh", background: C.bg, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside style={{
          width: 220, flexShrink: 0,
          background: C.bgSidebar,
          borderRight: "1px solid " + C.border,
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

          {/* + New Project */}
          <div style={{ padding: "0 12px 16px" }}>
            <button
              onClick={function () { setOpenAdd(true); }}
              style={{
                width: "100%", background: GB, border: "1px solid " + GB_BDR,
                borderRadius: 8, padding: "9px 14px",
                color: C.accent, fontSize: 12, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                textAlign: "left", display: "flex", alignItems: "center", gap: 7,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              New Project
            </button>
          </div>

          {/* Nav */}
          <nav style={{ padding: "0 8px", flex: 1 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: 8,
              background: GB, border: "1px solid " + GB_BDR,
              color: C.accent, fontSize: 13, fontWeight: 600, marginBottom: 2,
            }}>
              Projects
            </div>
          </nav>

          {/* User menu */}
          <div style={{ padding: "16px 12px 0", borderTop: "1px solid " + C.border, marginTop: 16 }}>
            <UserMenu userMeta={userMeta} onSignOut={signOut} onTour={replayTour} dropUp />
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
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

          <ProjectsView
            userId={userId}
            accounts={accounts}
            openAdd={openAdd}
            onAddClosed={function () { setOpenAdd(false); }}
          />
        </main>
      </div>

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
}
