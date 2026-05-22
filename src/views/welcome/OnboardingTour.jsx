import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { FolioIcon } from "../../components/FolioIcon";
import { PipMark } from "../../components/PipMark";

var SCREENS = [
  { isIntro: true },
  {
    headline: "Oh. A new hire. Great.",
    body: "I'm Pip — your AI field analyst. I live in this app now. It's fine.",
    sub: "I handle account intelligence, meeting prep, and the occasional awkward email. Mostly the first two.",
    pipTop: "18%", pipLeft: "50%",
  },
  {
    headline: "Your accounts.",
    body: "These are the people who determine whether you hit quota. Worth paying attention to.",
    sub: "Each one has contacts, meetings, open items, and a health status. Green is good. Red is a conversation you've been avoiding.",
    pipTop: "22%", pipLeft: "20%",
  },
  {
    headline: "Log your meetings.",
    body: "Notes, action items, talking points — all of it. I'll read them.",
    sub: "Log everything. Future you will thank present you. I've watched too many 'I'll remember this' situations end badly.",
    pipTop: "22%", pipLeft: "80%",
  },
  {
    headline: "Pipeline.",
    body: "The full picture. Revenue, tiers, account health across your whole book.",
    sub: "If something is red, you already know what you need to do. I'm not going to pretend otherwise.",
    pipTop: "30%", pipLeft: "50%",
  },
  {
    headline: "Cadence.",
    body: "Your recurring meeting hub. Set a schedule, and I'll surface it automatically.",
    sub: "Open items carry forward until closed. It's a system for not dropping balls. You'd be surprised.",
    pipTop: "20%", pipLeft: "18%",
  },
  {
    headline: "Gauge.",
    body: "Where commitments become projects. When you promise a client something, it goes in Gauge so it actually gets done.",
    sub: "It's a separate app. Blue themed. Very sleek. I had nothing to do with the design but I respect it.",
    pipTop: "20%", pipLeft: "82%",
  },
  {
    headline: "That's me.",
    body: "That glowing dot in the corner? Always there. Never intrusive. Mostly.",
    sub: "Ask me anything — account summaries, meeting prep, follow-up emails. I've read everything in here. I have opinions.",
    pipTop: "22%", pipLeft: "50%",
    pipLarge: true,
  },
  {
    isDone: true,
    headline: "Alright. You're ready.",
    body: "Don't lose any accounts.",
    pipTop: "28%", pipLeft: "50%",
  },
];

export function OnboardingTour({ onComplete }) {
  var [screen, setScreen]         = useState(0);
  var [visible, setVisible]       = useState(false);
  var [zipping, setZipping]       = useState(false);
  var [introPhase, setIntroPhase] = useState(0);
  var [introRisen, setIntroRisen] = useState(false);

  useEffect(function () {
    setTimeout(function () { setVisible(true); }, 30);
  }, []);

  useEffect(function () {
    if (screen !== 0) return;
    var t1 = setTimeout(function () { setIntroPhase(1); }, 700);
    var t2 = setTimeout(function () { setIntroPhase(2); }, 1900);
    return function () { clearTimeout(t1); clearTimeout(t2); };
  }, [screen]);

  useEffect(function () {
    if (introPhase !== 1) return;
    var t = setTimeout(function () { setIntroRisen(true); }, 950);
    return function () { clearTimeout(t); };
  }, [introPhase]);

  var current  = SCREENS[screen];
  var pipSize  = current.pipLarge ? 88 : 70;
  var half     = pipSize / 2;
  var isLast   = screen === SCREENS.length - 1;

  function advance() {
    if (screen === 0 && introPhase < 2) return;
    if (isLast) { onComplete(); return; }
    setZipping(true);
    setTimeout(function () {
      setScreen(function (s) { return s + 1; });
      setZipping(false);
    }, 220);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: C.bgDark,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s",
      }}
    >
      {/* INTRO SCREEN */}
      {screen === 0 && (
        <div
          onClick={introPhase === 2 ? advance : undefined}
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Folio icon */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            animation: "folioAppear 0.7s ease-out forwards",
            opacity: 0,
          }}>
            <FolioIcon size={90} />
          </div>

          {/* Pip orb rising */}
          {introPhase >= 1 && (
            <div style={{
              position: "absolute",
              top: "27%", left: "50%",
              width: 80, height: 80,
              marginLeft: -40,
            }}>
              {/* Sonar rings — only after rise completes */}
              {introRisen && (
                <>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 80, height: 80, borderRadius: "50%",
                    border: "1px solid rgba(200,136,58,0.3)",
                    animation: "tourSonar 3s ease-out infinite",
                    pointerEvents: "none",
                  }} />
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 80, height: 80, borderRadius: "50%",
                    border: "1px solid rgba(200,136,58,0.3)",
                    animation: "tourSonar 3s ease-out 1.5s infinite",
                    pointerEvents: "none",
                  }} />
                </>
              )}
              {/* Orb */}
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: "rgba(200,136,58,0.1)",
                border: "1px solid rgba(200,136,58,0.4)",
                boxShadow: "0 0 32px rgba(200,136,58,0.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: introRisen
                  ? "pipFloat 3s ease-in-out infinite"
                  : "pipRise 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}>
                <PipMark size={18} color={C.accent} glow />
              </div>
            </div>
          )}

          {/* Tap hint */}
          {introPhase === 2 && (
            <div style={{
              position: "absolute", bottom: "16%", left: 0, right: 0,
              textAlign: "center", fontSize: 11, color: C.textMuted,
              letterSpacing: "0.12em", textTransform: "uppercase",
              animation: "tapPulse 2s ease-in-out infinite",
            }}>
              Tap anywhere to continue
            </div>
          )}
        </div>
      )}

      {/* CONTENT SCREENS */}
      {screen > 0 && (
        <>
          {/* Pip floating around */}
          <div style={{
            position: "fixed",
            top: current.pipTop,
            left: current.pipLeft,
            width: pipSize,
            height: pipSize,
            marginLeft: -half,
            marginTop: -half,
            transition: "top 0.38s cubic-bezier(0.34,1.56,0.64,1), left 0.38s cubic-bezier(0.34,1.56,0.64,1)",
            zIndex: 1010,
          }}>
            <div style={{
              width: pipSize,
              height: pipSize,
              borderRadius: "50%",
              background: "rgba(200,136,58,0.1)",
              border: "1px solid rgba(200,136,58,0.38)",
              boxShadow: "0 0 " + (current.pipLarge ? "38px" : "22px") + " rgba(200,136,58,0.26)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: zipping ? 0 : 1,
              transform: zipping ? "scale(0.2)" : "scale(1)",
              transition: "opacity 0.18s, transform 0.18s",
              animation: zipping ? "none" : "pipFloat 3s ease-in-out infinite",
            }}>
              <PipMark size={current.pipLarge ? 20 : 16} color={C.accent} glow />
            </div>
          </div>

          {/* Bottom content card */}
          <div
            key={"card-" + screen}
            className="fade-in"
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              background: C.bgCard,
              borderTop: "1px solid " + C.border,
              borderRadius: "20px 20px 0 0",
              padding: "24px 28px 48px",
            }}
          >
            {/* Progress dots */}
            <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 22 }}>
              {SCREENS.slice(1).map(function (_, i) {
                var active = i === screen - 1;
                return (
                  <div key={i} style={{
                    height: 5, borderRadius: 3,
                    width: active ? 20 : 5,
                    background: active ? C.accent : C.textMuted,
                    transition: "width 0.25s, background 0.25s",
                  }} />
                );
              })}
            </div>

            {current.headline && (
              <div style={{
                fontSize: 20, fontWeight: 700, color: C.text,
                marginBottom: 10, lineHeight: 1.2,
              }}>
                {current.headline}
              </div>
            )}

            {current.body && (
              <div style={{
                fontSize: 14, color: C.textSub, lineHeight: 1.6,
                marginBottom: current.sub ? 8 : 24,
              }}>
                {current.body}
              </div>
            )}

            {current.sub && (
              <div style={{
                fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 24,
              }}>
                {current.sub}
              </div>
            )}

            <button
              onClick={advance}
              style={{
                width: "100%",
                background: current.isDone ? C.accent : C.accentGlow,
                border: current.isDone ? "none" : "1px solid rgba(200,136,58,0.3)",
                borderRadius: 24, padding: "14px",
                fontSize: 13, fontWeight: 700,
                color: current.isDone ? "#0D0B07" : C.accent,
                fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
              }}
            >
              {current.isDone ? "Let's go" : "Continue →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
