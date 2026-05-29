import { useState, useEffect } from "react";
import { C } from "../../lib/colors";
import { FolioIcon } from "../../components/FolioIcon";
import { GaugeIcon } from "../../components/GaugeIcon";
import { PipMark } from "../../components/PipMark";

/* ── Generic preview components — never uses real account data ── */

function Shell({ blue, children }) {
  return (
    <div style={{
      background: blue ? "rgba(8,16,24,0.93)" : "rgba(13,11,7,0.91)",
      border: "1px solid " + (blue ? "rgba(123,108,246,0.22)" : C.border),
      borderRadius: 14,
      padding: "10px 12px",
    }}>
      {children}
    </div>
  );
}

function PreviewLabel({ text, blue }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase",
      color: blue ? C.blue : C.textMuted, marginBottom: 8,
    }}>
      {text}
    </div>
  );
}

function AccountsPreview() {
  var rows = [
    { name: "Acme Corp",      tier: 1, days: 3,  dot: "#4ade80" },
    { name: "BrightPath Inc", tier: 2, days: 12, dot: C.accent  },
    { name: "Vertex Labs",    tier: 1, days: 28, dot: C.red      },
  ];
  return (
    <Shell>
      <PreviewLabel text="Accounts" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map(function (r) {
          return (
            <div key={r.name} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: C.bgCardAlt, borderRadius: 8, padding: "7px 10px",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>Tier {r.tier} · {r.days}d since last meeting</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.dot, flexShrink: 0 }} />
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function MeetingsPreview() {
  var rows = [
    { name: "Acme Corp",      date: "May 19", note: "Q3 roadmap · pricing deck", items: 2 },
    { name: "BrightPath Inc", date: "May 14", note: "Product demo · follow-up open", items: 1 },
  ];
  return (
    <Shell>
      <PreviewLabel text="Meetings" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {rows.map(function (r) {
          return (
            <div key={r.name} style={{
              background: C.bgCardAlt, borderRadius: 8, padding: "7px 10px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.name}</div>
                <div style={{ fontSize: 10, color: C.textMuted }}>{r.date}</div>
              </div>
              <div style={{ fontSize: 10, color: C.textSub, marginBottom: 3 }}>{r.note}</div>
              <div style={{ fontSize: 9, color: C.accent }}>{r.items} action item{r.items !== 1 ? "s" : ""}</div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function CadencePreview() {
  return (
    <Shell>
      <PreviewLabel text="Cadence · Acme Corp" />
      <div style={{ marginBottom: 9 }}>
        <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 2 }}>
          Every Thursday · Next: May 29
        </div>
        <div style={{ fontSize: 10, color: C.textMuted }}>2 open items pinned</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {["Follow up on pricing deck", "Send Q3 proposal draft"].map(function (item, i) {
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.bgCardAlt, borderRadius: 7, padding: "6px 9px",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", border: "1px solid " + C.accent, flexShrink: 0 }} />
              <div style={{ fontSize: 10, color: C.textSub }}>{item}</div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function GaugePreview() {
  var projects = [
    { title: "Pricing Proposal", account: "Acme Corp",   due: "Jun 15", status: "Active",  sc: "#4ade80"    },
    { title: "Integration Docs", account: "Vertex Labs", due: "May 31", status: "On Hold", sc: C.textMuted  },
  ];
  return (
    <Shell blue>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <GaugeIcon size={11} color={C.blue} />
        <div style={{ fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: C.blue }}>Gauge</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {projects.map(function (p) {
          return (
            <div key={p.title} style={{
              background: "rgba(123,108,246,0.05)",
              border: "1px solid rgba(123,108,246,0.12)",
              borderRadius: 8, padding: "7px 10px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.title}</div>
                <div style={{ fontSize: 9, color: p.sc }}>{p.status}</div>
              </div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{p.account} · Due {p.due}</div>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function PipPreview() {
  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <PipMark size={9} color={C.accent} glow />
        <div style={{ fontSize: 9, letterSpacing: "0.09em", textTransform: "uppercase", color: C.accent }}>
          Pip on Acme Corp
        </div>
      </div>
      <div style={{
        background: C.accentFaint,
        border: "1px solid " + C.accentShadow,
        borderRadius: 10, borderTopLeftRadius: 2,
        padding: "9px 11px",
        fontSize: 11, color: C.textSub, lineHeight: 1.6,
        fontStyle: "italic",
      }}>
        "Acme's been quiet for 3 days. Their Q2 closes in 8 days. I'd reach out today — they respond better before the quarter-end scramble."
      </div>
    </Shell>
  );
}

/* ── Screen definitions ───────────────────────────────────────── */

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
    body: "Every contact, meeting, and open item — under one roof.",
    pipTop: "10%", pipLeft: "15%",
    visual: AccountsPreview,
  },
  {
    headline: "Log your meetings.",
    body: "Notes, action items, talking points — all of it. I'll read them.",
    pipTop: "10%", pipLeft: "82%",
    visual: MeetingsPreview,
  },
  {
    headline: "Cadence.",
    body: "Your recurring meeting hub. Set a schedule, I'll surface it. Open items carry forward until closed.",
    pipTop: "10%", pipLeft: "15%",
    visual: CadencePreview,
  },
  {
    headline: "Gauge.",
    body: "When you promise a client something, it goes in Gauge so it actually gets done.",
    pipTop: "10%", pipLeft: "82%",
    visual: GaugePreview,
  },
  {
    headline: "That's me.",
    body: "Ask me anything — account summaries, meeting prep, follow-up emails. I've read everything in here. I have opinions.",
    pipTop: "10%", pipLeft: "50%",
    pipLarge: true,
    visual: PipPreview,
  },
  {
    isDone: true,
    headline: "Alright. You're ready.",
    body: "Don't lose any accounts.",
    pipTop: "28%", pipLeft: "50%",
  },
];

/* ── Component ────────────────────────────────────────────────── */

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
  var pipSize = current.pipLarge ? 88 : 70;
  var half    = pipSize / 2;
  var isLast  = screen === SCREENS.length - 1;

  function advance() {
    if (screen === 0 && introPhase < 2) return;
    if (isLast) { onComplete(); return; }
    setZipping(true);
    setTimeout(function () {
      setScreen(function (s) { return s + 1; });
      setZipping(false);
    }, 220);
  }

  var Visual = current.visual || null;

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
              {introRisen && (
                <>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 80, height: 80, borderRadius: "50%",
                    border: "1px solid " + C.accentSubtle,
                    animation: "tourSonar 3s ease-out infinite",
                    pointerEvents: "none",
                  }} />
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: 80, height: 80, borderRadius: "50%",
                    border: "1px solid " + C.accentSubtle,
                    animation: "tourSonar 3s ease-out 1.5s infinite",
                    pointerEvents: "none",
                  }} />
                </>
              )}
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: C.accentGlow,
                border: "1px solid " + C.accentBorder,
                boxShadow: "0 0 32px " + C.accentSubtle,
                display: "flex", alignItems: "center", justifyContent: "center",
                animation: introRisen
                  ? "pipFloat 3s ease-in-out infinite"
                  : "pipRise 0.9s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}>
                <PipMark size={18} color={C.accent} glow />
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
              background: C.accentGlow,
              border: "1px solid " + C.accentBorder,
              boxShadow: "0 0 " + (current.pipLarge ? "38px" : "22px") + " " + C.accentSubtle,
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

          {/* Feature visual mockup */}
          {Visual && (
            <div
              key={"visual-" + screen}
              className="fade-in"
              style={{
                position: "fixed",
                top: "26%",
                left: "50%",
                transform: "translateX(-50%)",
                width: "88%",
                maxWidth: 340,
                zIndex: 1005,
                opacity: zipping ? 0 : 1,
                transition: "opacity 0.18s",
              }}
            >
              <Visual />
            </div>
          )}

          {/* Bottom content card */}
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
              onClick={function (e) { e.stopPropagation(); advance(); }}
              style={{
                width: "100%",
                background: current.isDone ? C.accent : C.accentGlow,
                border: current.isDone ? "none" : "1px solid " + C.accentSubtle,
                borderRadius: 24, padding: "14px",
                fontSize: 13, fontWeight: 700,
                color: current.isDone ? "#091712" : C.accent,
                fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
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
