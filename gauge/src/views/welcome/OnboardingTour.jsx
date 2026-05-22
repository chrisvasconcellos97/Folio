import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { GaugeIcon } from "../../components/GaugeIcon";
import { PipMark } from "../../components/PipMark";

var AC  = C.accent;                         // cyan
var AGA = "rgba(103,200,249,0.10)";
var AGB = "rgba(103,200,249,0.38)";
var AGS = "rgba(103,200,249,0.26)";

/* ── Preview components (generic data) ─────────────────────────── */

function Shell({ children }) {
  return (
    <div style={{
      background: "rgba(8,16,24,0.92)",
      border: "1px solid rgba(103,200,249,0.18)",
      borderRadius: 14,
      padding: "10px 12px",
    }}>
      {children}
    </div>
  );
}

function Label({ text }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase",
      color: C.textMuted, marginBottom: 8,
    }}>
      {text}
    </div>
  );
}

function ProjectsPreview() {
  var rows = [
    { account: "Acme Corp",   title: "Pricing Proposal", status: "Active",  sc: C.accent,  priority: "High",   pc: C.red    },
    { account: "Vertex Labs", title: "Integration Docs", status: "On Hold", sc: C.yellow, priority: "Medium", pc: C.yellow },
    { account: "BrightPath",  title: "Q3 Report",        status: "Active",  sc: C.accent,  priority: "Low",    pc: C.green  },
  ];
  return (
    <Shell>
      <Label text="Projects" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map(function (r) {
          return (
            <div key={r.title} style={{
              background: C.bgCardAlt, borderRadius: 8, padding: "7px 10px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, color: C.accentDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                  {r.account}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.title}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.pc }} />
                <div style={{
                  fontSize: 9, fontWeight: 600, color: r.sc,
                  background: r.sc + "1A", border: "1px solid " + r.sc + "33",
                  borderRadius: 10, padding: "2px 7px",
                }}>
                  {r.status}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function AccountLinkPreview() {
  return (
    <Shell>
      <Label text="Account → Projects" />
      <div style={{
        background: C.bgCardAlt, borderRadius: 8, padding: "9px 11px", marginBottom: 6,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 6 }}>Acme Corp</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {["Pricing Proposal", "Q3 Report", "Onboarding Deck"].map(function (t) {
            return (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent, opacity: 0.6, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: C.textSub }}>{t}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.textMuted }}>Every commitment, tied to where it came from.</div>
    </Shell>
  );
}

function StatusPreview() {
  var statuses = [
    { label: "Active",    color: C.accent, pct: 75 },
    { label: "On Hold",   color: C.yellow, pct: 45 },
    { label: "Completed", color: C.green,  pct: 100 },
  ];
  return (
    <Shell>
      <Label text="Status · Priority · Due Date" />
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {statuses.map(function (s) {
          return (
            <div key={s.label}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 9, color: s.color }}>{s.pct}%</div>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: C.bgCardAlt, overflow: "hidden" }}>
                <div style={{ height: "100%", width: s.pct + "%", borderRadius: 2, background: s.color, opacity: 0.7 }} />
              </div>
            </div>
          );
        })}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 2,
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 7, padding: "5px 8px",
        }}>
          <div style={{ fontSize: 9, color: C.red, fontWeight: 700 }}>⚠ Overdue</div>
          <div style={{ fontSize: 9, color: C.textMuted }}>Integration Docs · was due May 31</div>
        </div>
      </div>
    </Shell>
  );
}

/* ── Screen definitions ─────────────────────────────────────────── */

var SCREENS = [
  { isIntro: true },
  {
    headline: "Oh. You actually opened Gauge.",
    body: "I'm Pip — your AI field analyst. I live in Folio too. I get around.",
    sub: "Gauge is where commitments become things that actually get tracked.",
    pipTop: "18%", pipLeft: "50%",
  },
  {
    headline: "Projects.",
    body: "Every promise you made to a client lives here until it's done.",
    pipTop: "10%", pipLeft: "15%",
    visual: ProjectsPreview,
  },
  {
    headline: "Link it to your accounts.",
    body: "Connect each project to the Folio account it came from. So you never forget who you made the promise to.",
    pipTop: "10%", pipLeft: "82%",
    visual: AccountLinkPreview,
  },
  {
    headline: "Status. Priority. Due dates.",
    body: "Active, On Hold, Completed. High, Medium, Low. Overdue shows in red. You'll know.",
    pipTop: "10%", pipLeft: "50%",
    visual: StatusPreview,
  },
  {
    isDone: true,
    headline: "Right. That's Gauge.",
    body: "Go track something.",
    pipTop: "28%", pipLeft: "50%",
  },
];

/* ── Component ──────────────────────────────────────────────────── */

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

  var current = SCREENS[screen];
  var pipSize = 70;
  var half    = pipSize / 2;
  var isLast  = screen === SCREENS.length - 1;
  var Visual  = current.visual || null;

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
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: C.bgDark,
      opacity: visible ? 1 : 0,
      transition: "opacity 0.4s",
    }}>

      {/* INTRO SCREEN */}
      {screen === 0 && (
        <div
          onClick={introPhase === 2 ? advance : undefined}
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Gauge icon */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            animation: "gaugeAppear 0.7s ease-out forwards",
            opacity: 0,
          }}>
            <GaugeIcon size={90} glow />
          </div>

          {/* Pip rising */}
          {introPhase >= 1 && (
            <div style={{
              position: "absolute", top: "27%", left: "50%",
              width: 80, height: 80, marginLeft: -40,
            }}>
              {introRisen && (
                <>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 80, height: 80, borderRadius: "50%",
                    border: "1px solid rgba(103,200,249,0.3)",
                    animation: "tourSonar 3s ease-out infinite",
                    pointerEvents: "none",
                  }} />
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 80, height: 80, borderRadius: "50%",
                    border: "1px solid rgba(103,200,249,0.3)",
                    animation: "tourSonar 3s ease-out 1.5s infinite",
                    pointerEvents: "none",
                  }} />
                </>
              )}
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: AGA,
                border: "1px solid rgba(103,200,249,0.4)",
                boxShadow: "0 0 32px rgba(103,200,249,0.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: introRisen
                  ? "pipFloat 3s ease-in-out infinite"
                  : "pipRise 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}>
                <PipMark size={18} color={AC} glow />
              </div>
            </div>
          )}

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
          {/* Pip floating */}
          <div style={{
            position: "fixed",
            top: current.pipTop, left: current.pipLeft,
            width: pipSize, height: pipSize,
            marginLeft: -half, marginTop: -half,
            transition: "top 0.38s cubic-bezier(0.34,1.56,0.64,1), left 0.38s cubic-bezier(0.34,1.56,0.64,1)",
            zIndex: 1010,
          }}>
            <div style={{
              width: pipSize, height: pipSize,
              borderRadius: "50%",
              background: AGA,
              border: "1px solid " + AGB,
              boxShadow: "0 0 22px " + AGS,
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: zipping ? 0 : 1,
              transform: zipping ? "scale(0.2)" : "scale(1)",
              transition: "opacity 0.18s, transform 0.18s",
              animation: zipping ? "none" : "pipFloat 3s ease-in-out infinite",
            }}>
              <PipMark size={16} color={AC} glow />
            </div>
          </div>

          {/* Visual mockup */}
          {Visual && (
            <div
              key={"visual-" + screen}
              className="fade-in"
              style={{
                position: "fixed",
                top: "26%", left: "50%",
                transform: "translateX(-50%)",
                width: "88%", maxWidth: 340,
                zIndex: 1005,
                opacity: zipping ? 0 : 1,
                transition: "opacity 0.18s",
              }}
            >
              <Visual />
            </div>
          )}

          {/* Bottom card */}
          <div
            key={"card-" + screen}
            className="fade-in"
            onClick={advance}
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              background: C.bgCard,
              borderTop: "1px solid " + C.border,
              borderRadius: "20px 20px 0 0",
              padding: "24px 28px 48px",
              cursor: "pointer",
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
                    background: active ? AC : C.textMuted,
                    transition: "width 0.25s, background 0.25s",
                  }} />
                );
              })}
            </div>

            {current.headline && (
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 10, lineHeight: 1.2 }}>
                {current.headline}
              </div>
            )}
            {current.body && (
              <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, marginBottom: current.sub ? 8 : 24 }}>
                {current.body}
              </div>
            )}
            {current.sub && (
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 24 }}>
                {current.sub}
              </div>
            )}

            <button
              onClick={function (e) { e.stopPropagation(); advance(); }}
              style={{
                width: "100%",
                background: current.isDone ? C.accent : AGA,
                border: current.isDone ? "none" : "1px solid rgba(103,200,249,0.3)",
                borderRadius: 24, padding: "14px",
                fontSize: 13, fontWeight: 700,
                color: current.isDone ? C.bg : C.accent,
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
