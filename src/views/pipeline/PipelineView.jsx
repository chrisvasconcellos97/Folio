import { C } from "../../lib/colors";
import { PipMark } from "../../components/PipMark";
import { Pill } from "../../components/Pill";
import {
  latestRecord, accountRecords,
  momPct, yoyPct,
  fmtRevenue, fmtPct,
  MONTH_NAMES,
} from "../../lib/metricsUtils";

var TIER_COLORS = { Major: C.blue, Mid: C.purple, Growth: C.green };

function pctColor(pct) {
  if (pct === null || pct === undefined) return C.textMuted;
  return pct >= 0 ? C.green : C.red;
}

function Sparkline({ records }) {
  if (!records || records.length === 0) return null;
  var last12  = records.slice(-12);
  var maxRev  = Math.max.apply(null, last12.map(function (r) { return r.revenue; }));
  if (maxRev === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22, marginTop: 10 }}>
      {last12.map(function (r, i) {
        var h      = Math.max(2, Math.round((r.revenue / maxRev) * 22));
        var isLast = i === last12.length - 1;
        return (
          <div
            key={i}
            title={MONTH_NAMES[r.month - 1] + " " + r.year + ": " + fmtRevenue(r.revenue)}
            style={{
              flex: 1,
              height: h,
              background: isLast ? C.accent : C.accentDim,
              borderRadius: 1,
              opacity: isLast ? 0.9 : 0.45,
            }}
          />
        );
      })}
    </div>
  );
}

function pipAnalysis(accounts, revenueHistory) {
  var withData = accounts.filter(function (a) { return latestRecord(revenueHistory, a.id) !== null; });

  if (withData.length === 0) {
    return "No revenue history yet. Once you log the first month for any account, I can start tracking trends and flagging what's moving.";
  }

  var momValues = withData
    .map(function (a) { return momPct(revenueHistory, a.id, "revenue"); })
    .filter(function (p) { return p !== null; });
  var avgMoM = momValues.length > 0
    ? Math.round(momValues.reduce(function (s, p) { return s + p; }, 0) / momValues.length)
    : null;
  var down = momValues.filter(function (p) { return p < 0; }).length;

  var parts = [withData.length + " of " + accounts.length + " accounts reporting."];
  if (avgMoM !== null) {
    parts.push("Book is " + (avgMoM >= 0 ? "up" : "down") + " " + Math.abs(avgMoM) + "% MoM on average.");
  }
  if (down > 0) {
    parts.push(down + " account" + (down !== 1 ? "s" : "") + " trending down — worth a look.");
  } else if (momValues.length > 0) {
    parts.push("Everything with data is trending up. Don't jinx it.");
  }
  return parts.join(" ");
}

export function PipelineView({ accounts, loading, revenueHistory, shopMetrics }) {
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 13 }}>
        Loading pipeline...
      </div>
    );
  }

  revenueHistory = revenueHistory || [];

  var withData    = accounts.filter(function (a) { return latestRecord(revenueHistory, a.id) !== null; });
  var withoutData = accounts.filter(function (a) { return latestRecord(revenueHistory, a.id) === null; });

  withData.sort(function (a, b) {
    return latestRecord(revenueHistory, b.id).revenue - latestRecord(revenueHistory, a.id).revenue;
  });

  return (
    <div>
      {/* Pip analysis */}
      <div
        style={{
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <PipMark size={9} color={C.accent} glow pulse />
          <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Pip — Pipeline Health
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>
          {pipAnalysis(accounts, revenueHistory)}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Accounts with revenue history */}
        {withData.map(function (a) {
          var latest     = latestRecord(revenueHistory, a.id);
          var mom        = momPct(revenueHistory, a.id, "revenue");
          var yoy        = yoyPct(revenueHistory, a.id, "revenue");
          var records    = accountRecords(revenueHistory, a.id);
          var monthLabel = latest ? MONTH_NAMES[latest.month - 1] + " " + latest.year : "";

          return (
            <div
              key={a.id}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 5 }}>{a.name}</div>
                  {a.tier && (
                    <Pill color={TIER_COLORS[a.tier] || C.textSub} style={{ fontSize: 9 }}>{a.tier}</Pill>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
                    {fmtRevenue(latest ? latest.revenue : null)}
                  </div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 5 }}>{monthLabel}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {mom !== null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(mom) }}>
                        {fmtPct(mom)} MoM
                      </span>
                    )}
                    {yoy !== null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(yoy) }}>
                        {fmtPct(yoy)} YoY
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Sparkline records={records} />
            </div>
          );
        })}

        {/* Divider */}
        {withoutData.length > 0 && withData.length > 0 && (
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 2px 2px" }}>
            No history yet
          </div>
        )}

        {/* Accounts without revenue history */}
        {withoutData.map(function (a) {
          return (
            <div
              key={a.id}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderRadius: 12,
                padding: "12px 14px",
                opacity: 0.55,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.textSub, marginBottom: 5 }}>{a.name}</div>
                  {a.tier && (
                    <Pill color={TIER_COLORS[a.tier] || C.textSub} style={{ fontSize: 9 }}>{a.tier}</Pill>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted }}>No data yet</div>
              </div>
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
            No accounts yet.
          </div>
        )}
      </div>
    </div>
  );
}
