import { C } from "../../lib/colors";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function relTime(iso) {
  if (!iso) return "";
  var diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff) || diff < 0) return "";
  var h = Math.floor(diff / 3600000);
  if (h < 1) return Math.max(1, Math.floor(diff / 60000)) + "m ago";
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function kickoffLabel(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // eslint-ok: one-off locale format (kickoff weekday + time)
  return d.toLocaleDateString([], { weekday: "short" }) + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MatchRow({ m }) {
  var score = (m.homeGoals != null && m.awayGoals != null) ? m.homeGoals + "–" + m.awayGoals : null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      {m.status === "live" && (
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.red, fontWeight: 700, letterSpacing: "0.06em" }}>● LIVE{m.minute ? " " + m.minute + "'" : ""}</span>
      )}
      {m.status === "final" && (
        <span style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, fontWeight: 700, letterSpacing: "0.06em" }}>FT</span>
      )}
      <span style={{ fontFamily: INTER, fontSize: 13.5, color: C.textSoft }}>
        {m.home} {score ? <strong style={{ color: C.text }}>{score}</strong> : <span style={{ color: C.textMuted }}>vs</span>} {m.away}
      </span>
      {m.status === "upcoming" && m.kickoff && (
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted }}>{kickoffLabel(m.kickoff)}</span>
      )}
    </div>
  );
}

export function SportsCard({ data, isMobile, onHide }) {
  if (!data) return null;
  var matches = Array.isArray(data.matches) ? data.matches : [];
  var news = Array.isArray(data.news) ? data.news : [];
  if (!matches.length && !news.length) return null;

  // Live first, then upcoming, then finals.
  var order = { live: 0, upcoming: 1, final: 2 };
  matches = matches.slice().sort(function (a, b) { return (order[a.status] || 9) - (order[b.status] || 9); });

  return (
    <div style={{ padding: isMobile ? "0 12px 16px" : "0 32px 16px", maxWidth: 980, margin: "0 auto" }}>
      <div style={{ background: C.surface, border: "1px solid " + C.rule, borderLeft: "2px solid " + C.accent, borderRadius: 12, padding: "13px 15px 15px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            ✦ Off the clock
          </div>
          {onHide && (
            <button onClick={onHide} title="Hide this card"
              style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, background: "none", border: "none", cursor: "pointer", padding: 2 }}>hide</button>
          )}
        </div>

        {matches.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: news.length ? 12 : 0, paddingBottom: news.length ? 12 : 0, borderBottom: news.length ? "1px solid " + C.rule : "none" }}>
            {matches.map(function (m, i) { return <MatchRow key={i} m={m} />; })}
          </div>
        )}

        {news.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {news.map(function (n, i) {
              return (
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", textDecoration: "none" }}>
                  <span style={{ fontFamily: MONO, fontSize: 8.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.05em", border: "1px solid " + C.accentLine, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>{n.topic}</span>
                  <span style={{ fontFamily: INTER, fontSize: 13, color: C.textSoft, lineHeight: 1.45, flex: "1 1 220px" }}>{n.title}</span>
                  {n.published && <span style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, whiteSpace: "nowrap" }}>{relTime(n.published)}</span>}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
