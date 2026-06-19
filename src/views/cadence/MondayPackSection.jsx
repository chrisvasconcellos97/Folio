import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { MarkdownText } from "../../components/MarkdownText";
import { Glow } from "../../components/Glow";
import { HexSignature } from "../../lib/hexMotif";
import { fmtRelative } from "../../lib/dateUtils";
import { useMondayPack } from "../../hooks/useMondayPack";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

function MiniHeader({ children, glyph, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      fontFamily: MONO, fontSize: 9.5, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.1em",
      color: color || C.textMuted, marginBottom: 7,
    }}>
      {glyph && <span style={{ width: 7, height: 7, borderRadius: 2, background: color || C.textMuted, display: "inline-block" }} />}
      {children}
    </div>
  );
}

function WordRow({ row, color, onOpenAccount, strike }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 13, color: C.textSub, lineHeight: 1.5, marginBottom: 3 }}>
      <span style={{ color: color, flexShrink: 0, fontSize: 11 }}>•</span>
      <span style={{ textDecoration: strike ? "line-through" : "none", opacity: strike ? 0.7 : 1 }}>
        {row.text}
        {row.due ? <span style={{ color: C.textMuted, fontSize: 11.5 }}>{"  · due " + row.due}</span> : null}
        {row.account ? (
          <span style={{ fontSize: 11.5 }}>
            {"  "}
            {onOpenAccount && row.account_id
              ? <Glow onClick={function () { onOpenAccount(row.account_id); }}>{"→ " + row.account}</Glow>
              : <span style={{ color: C.textMuted }}>{"→ " + row.account}</span>}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function MondayPackSection({ userId, cadence, accounts, userProfile, facts, personName, onOpenAccount, isMobile }) {
  var pack = useMondayPack(userId, cadence, {
    accounts: accounts,
    profileProse: userProfile && userProfile.profile_prose ? userProfile.profile_prose : null,
    facts: facts || [],
    personName: personName,
  });

  var s = pack.sections;
  if (!s) {
    return (
      <div style={panelStyle()}>
        <PackHeader pack={pack} />
        <div style={{ fontSize: 12, color: C.textMuted }}>Assembling your 1:1 pack…</div>
      </div>
    );
  }

  var w = s.yourWord;
  var ball = s.whoHasBall;

  return (
    <div style={panelStyle()}>
      <PackHeader pack={pack} />

      {/* 0 — Pip read */}
      {pack.loading && !pack.read ? (
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>Pip's reading your week…</div>
      ) : pack.read ? (
        <MarkdownText text={pack.read} style={{ fontSize: 14.5, color: C.text, lineHeight: 1.6, marginBottom: 16 }} />
      ) : (
        <div style={{ fontSize: 13.5, color: C.textSub, lineHeight: 1.6, marginBottom: 16 }}>
          {w.kept.length || w.slipped.length || w.open.length
            ? "Here's where your word stands going into the 1:1."
            : "Quiet week — nothing promised came due. Good time to get ahead."}
        </div>
      )}

      {/* 1 — YOUR WORD (leads) */}
      <div style={blockStyle()}>
        <MiniHeader>Your word — promised vs. done</MiniHeader>
        {w.slipped.length === 0 && w.open.length === 0 && w.kept.length === 0 ? (
          <Empty>No commitments tracked this week.</Empty>
        ) : (
          <>
            {w.slipped.length > 0 && (
              <SubGroup label={"Slipped (" + w.slipped.length + ")"} color={C.red}>
                {w.slipped.map(function (r) { return <WordRow key={r.id} row={r} color={C.red} onOpenAccount={onOpenAccount} />; })}
              </SubGroup>
            )}
            {w.open.length > 0 && (
              <SubGroup label={"Still open (" + w.open.length + ")"} color={C.yellow}>
                {w.open.map(function (r) { return <WordRow key={r.id} row={r} color={C.yellow} onOpenAccount={onOpenAccount} />; })}
              </SubGroup>
            )}
            {w.kept.length > 0 && (
              <SubGroup label={"Kept (" + w.kept.length + ")"} color={C.green}>
                {w.kept.map(function (r) { return <WordRow key={r.id} row={r} color={C.green} onOpenAccount={onOpenAccount} strike />; })}
              </SubGroup>
            )}
          </>
        )}
      </div>

      {/* 2 — BOSS'S OPEN ASKS, pre-answered */}
      <div style={blockStyle()}>
        <MiniHeader glyph color={C.accent}>Boss's open asks — pre-answered</MiniHeader>
        {pack.loading && pack.bossAsks.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMuted }}>Pip's pulling these from your last 1:1…</div>
        ) : pack.bossAsks.length === 0 ? (
          <Empty>No open asks captured from your last 1:1.</Empty>
        ) : (
          pack.bossAsks.map(function (a, i) {
            return (
              <div key={i} style={{ marginBottom: 9 }}>
                <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, lineHeight: 1.45 }}>
                  {a.ask}{a.account ? <span style={{ color: C.textMuted, fontWeight: 400, fontSize: 12 }}>{"  · " + a.account}</span> : null}
                </div>
                <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, marginTop: 1 }}>{a.status}</div>
              </div>
            );
          })
        )}
      </div>

      {/* 3 — WHAT MOVED, BY ACCOUNT */}
      <div style={blockStyle()}>
        <MiniHeader>What moved this week</MiniHeader>
        {s.whatMoved.length === 0 ? (
          <Empty>Nothing logged moved this week.</Empty>
        ) : (
          s.whatMoved.map(function (a, i) {
            var bits = [];
            if (a.meetings.length) bits.push(a.meetings.length + " meeting" + (a.meetings.length > 1 ? "s" : ""));
            if (a.deliveries.length) bits.push(a.deliveries.length + " delivered");
            if (a.pulses.length) bits.push(a.pulses.length + " update" + (a.pulses.length > 1 ? "s" : ""));
            return (
              <div key={i} style={{ fontSize: 13, color: C.textSub, lineHeight: 1.5, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, color: C.text }}>
                  {onOpenAccount && a.account_id
                    ? <Glow onClick={function () { onOpenAccount(a.account_id); }}>{a.account || "No account"}</Glow>
                    : (a.account || "No account")}
                </span>
                <span style={{ color: C.textMuted }}>{"  " + bits.join(" · ")}</span>
                {a.pulses.slice(0, 2).map(function (p, j) {
                  return <div key={j} style={{ fontSize: 12, color: C.textMuted, paddingLeft: 10, lineHeight: 1.45 }}>{"↳ " + p.body}</div>;
                })}
              </div>
            );
          })
        )}
      </div>

      {/* 4 — WHO HAS THE BALL */}
      <div style={{ ...blockStyle(), borderBottom: "none", paddingBottom: 0, marginBottom: 0 }}>
        <MiniHeader>Who has the ball</MiniHeader>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              {"They owe you (" + ball.owedMe.length + ")"}
            </div>
            {ball.owedMe.length === 0 ? <Empty small>Nothing — you're not blocked.</Empty> : ball.owedMe.slice(0, 6).map(function (r, i) {
              return (
                <div key={i} style={{ fontSize: 12.5, color: C.textSub, lineHeight: 1.45, marginBottom: 3 }}>
                  <span style={{ color: C.yellow }}>⏳ </span>{r.label}
                  <span style={{ color: C.textMuted }}>{" — " + (r.who || "?") + (r.since ? " (since " + r.since + ")" : "")}</span>
                </div>
              );
            })}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
              {"You owe (" + ball.iOwe.length + ")"}
            </div>
            {ball.iOwe.length === 0 ? <Empty small>Clear — nothing outstanding.</Empty> : ball.iOwe.slice(0, 6).map(function (r, i) {
              return (
                <div key={i} style={{ fontSize: 12.5, color: C.textSub, lineHeight: 1.45, marginBottom: 3 }}>
                  <span style={{ color: r.slipped ? C.red : C.textMuted }}>{r.slipped ? "● " : "○ "}</span>{r.label}
                  {r.account ? <span style={{ color: C.textMuted }}>{" — " + r.account}</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PackHeader({ pack }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PipMark size={9} color={C.accent} glow pulse={pack.loading} />
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Monday 1:1 Pack
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {pack.generatedAt && !pack.loading && (
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted }}>{"Built " + fmtRelative(pack.generatedAt)}</span>
        )}
        <button
          onClick={pack.refresh}
          disabled={pack.loading}
          style={{
            background: "none", border: "1px solid " + C.accentSubtle, borderRadius: 6,
            padding: "3px 9px", fontSize: 10, fontWeight: 600, color: C.accent,
            fontFamily: INTER, cursor: pack.loading ? "default" : "pointer", opacity: pack.loading ? 0.5 : 1,
          }}
        >
          {pack.loading ? "Working…" : "Refresh"}
        </button>
      </div>
      <HexSignature cells={5} peak={0.3} style={{ position: "absolute", right: -6, bottom: -10, pointerEvents: "none" }} />
    </div>
  );
}

function SubGroup({ label, color, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3, fontWeight: 700 }}>{label}</div>
      {children}
    </div>
  );
}

function Empty({ children, small }) {
  return <div style={{ fontSize: small ? 11.5 : 12.5, color: C.textMuted, lineHeight: 1.5, fontStyle: "italic" }}>{children}</div>;
}

function panelStyle() {
  return {
    background: C.accentGlow, border: "1px solid " + C.accentLine,
    borderRadius: 12, padding: "14px 16px",
  };
}

function blockStyle() {
  return { borderBottom: "1px solid " + C.rule, paddingBottom: 12, marginBottom: 12 };
}
