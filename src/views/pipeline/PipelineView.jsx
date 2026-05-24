import { useMemo } from "react";
import { C } from "../../lib/colors";
import { PipInsightCard } from "../../components/PipInsightCard";
import { PipLoader } from "../../components/PipLoader";
import { Pill } from "../../components/Pill";
import {
  latestRecord, accountRecords,
  momPct, yoyPct,
  fmtRevenue, fmtPct,
  MONTH_NAMES,
  pickV,
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

function buildPipelineInsight(accounts, revenueHistory) {
  var seed     = "pipeline" + new Date().getDate().toString();
  var withData = accounts.filter(function (a) { return latestRecord(revenueHistory, a.id) !== null; });

  if (withData.length === 0) {
    return pickV(seed + "p0", [
      "No revenue history yet. Once you log the first month for any account, I can start tracking trends and flagging what's moving.",
      "Pipeline is blank. Log the first month for any account and I'll show you what's trending.",
    ]);
  }

  var momValues = withData
    .map(function (a) { return momPct(revenueHistory, a.id, "revenue"); })
    .filter(function (p) { return p !== null; });
  var avgMoM  = momValues.length > 0
    ? Math.round(momValues.reduce(function (s, p) { return s + p; }, 0) / momValues.length)
    : null;
  var down    = momValues.filter(function (p) { return p < 0; }).length;
  var up      = momValues.filter(function (p) { return p > 0; }).length;
  var atRisk  = accounts.filter(function (a) { return a.status === "red"; }).length;
  var watching = accounts.filter(function (a) { return a.status === "yellow"; }).length;

  var parts = [];

  if (avgMoM !== null) {
    parts.push(pickV(seed + "pl", [
      withData.length + " of " + accounts.length + " accounts reporting. Book is " + (avgMoM >= 0 ? "up" : "down") + " " + Math.abs(avgMoM) + "% MoM on average.",
      "Tracking " + withData.length + " account" + (withData.length !== 1 ? "s" : "") + ". Average MoM: " + (avgMoM >= 0 ? "+" : "") + avgMoM + "%.",
    ]));
  } else {
    parts.push(pickV(seed + "pl", [
      withData.length + " of " + accounts.length + " accounts have revenue history logged.",
      withData.length + " reporting, " + (accounts.length - withData.length) + " without data yet.",
    ]));
  }

  if (down > 0) {
    parts.push(pickV(seed + "ps", [
      down + " account" + (down !== 1 ? "s are" : " is") + " trending down — worth a look.",
      down + " down, " + up + " up. Address the declines before they compound.",
    ]));
  } else if (momValues.length > 0) {
    parts.push(pickV(seed + "ps", [
      "Everything with data is trending up. Don't jinx it.",
      up + " account" + (up !== 1 ? "s" : "") + " moving in the right direction.",
    ]));
  }

  if (atRisk > 0) {
    parts.push(pickV(seed + "pc", [
      atRisk + " account" + (atRisk !== 1 ? "s" : "") + " marked at risk. Those need priority attention.",
      atRisk + " at-risk — make sure they're getting face time before the number gets worse.",
    ]));
  } else if (watching > 0) {
    parts.push(pickV(seed + "pc", [
      watching + " on watch status. Keep tabs.",
      watching + " account" + (watching !== 1 ? "s" : "") + " on yellow. Don't let those slip to red.",
    ]));
  }

  return parts.join(" ");
}

export function PipelineView({ accounts, loading, revenueHistory, shopMetrics }) {
  var rev = revenueHistory || [];
  var pipelineInsight = useMemo(function () {
    return buildPipelineInsight(accounts, rev);
  }, [accounts, rev]);

  if (loading) {
    return <PipLoader />;
  }

  revenueHistory = rev;

  var withData    = accounts.filter(function (a) { return latestRecord(revenueHistory, a.id) !== null; });
  var withoutData = accounts.filter(function (a) { return latestRecord(revenueHistory, a.id) === null; });

  withData.sort(function (a, b) {
    return latestRecord(revenueHistory, b.id).revenue - latestRecord(revenueHistory, a.id).revenue;
  });

  return (
    <div>
      {/* Pip analysis */}
      <PipInsightCard text={pipelineInsight} />

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
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 5 }}>{a.name}</div>
                  {a.tier && (
                    <Pill color={TIER_COLORS[a.tier] || C.textSub} style={{ fontSize: 9 }}>{a.tier}</Pill>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
                    {fmtRevenue(latest ? latest.revenue : null)}
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 5, fontVariantNumeric: "tabular-nums" }}>{monthLabel}</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {mom !== null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(mom), fontVariantNumeric: "tabular-nums" }}>
                        {fmtPct(mom)} MoM
                      </span>
                    )}
                    {yoy !== null && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: pctColor(yoy), fontVariantNumeric: "tabular-nums" }}>
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
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", padding: "6px 2px 2px" }}>
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
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.textSub, marginBottom: 5 }}>{a.name}</div>
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
            No accounts in the pipeline yet.
          </div>
        )}
      </div>
    </div>
  );
}
