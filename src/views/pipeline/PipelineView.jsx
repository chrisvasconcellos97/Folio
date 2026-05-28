import { useState, useMemo, useEffect } from "react";
import { C, glass } from "../../lib/colors";
import { Glow } from "../../components/Glow";
import { NavMark } from "../../components/NavMark";

var PV_MONO  = "'JetBrains Mono', ui-monospace, monospace";
var PV_SERIF = "'Fraunces', Georgia, serif";
import { PipInsightCard } from "../../components/PipInsightCard";
import { PipLoader } from "../../components/PipLoader";
import { Pill } from "../../components/Pill";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { FL } from "../../components/FieldLabel";
import { showToast } from "../../components/Toast";
import {
  latestRecord, accountRecords,
  momPct, yoyPct,
  fmtRevenue, fmtPct,
  MONTH_NAMES,
  pickV,
} from "../../lib/metricsUtils";

var TIER_COLORS = { Major: C.blue, Mid: C.purple, Growth: C.green };
var MONO = "'JetBrains Mono', ui-monospace, monospace";

var PIPELINE_PREF_KEY = "folio_pipeline_prefs";
function loadPipelinePrefs() {
  try { return JSON.parse(localStorage.getItem(PIPELINE_PREF_KEY) || "{}"); } catch(e) { return {}; }
}
function savePipelinePrefs(p) {
  try { localStorage.setItem(PIPELINE_PREF_KEY, JSON.stringify(p)); } catch(e) {}
}

var REVENUE_RANGES = [
  { id: "any",    label: "Any" },
  { id: "lt500k", label: "<$500K" },
  { id: "mid",    label: "$500K-$2M" },
  { id: "gt2m",   label: ">$2M" },
];

function matchRevenue(amount, range) {
  if (range === "any") return true;
  if (amount == null) return false;
  var n = Number(amount);
  if (range === "lt500k") return n < 500000;
  if (range === "mid")    return n >= 500000 && n <= 2000000;
  if (range === "gt2m")   return n > 2000000;
  return true;
}

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

function buildPipelineInsight(accountsAll, revenueHistory, handlers) {
  var seed     = "pipeline" + new Date().getDate().toString();
  // Archived accounts shouldn't pad the trending / at-risk counts.
  var accounts = (accountsAll || []).filter(function (a) { return !a.is_inactive; });
  var withData = accounts.filter(function (a) { return latestRecord(revenueHistory, a.id) !== null; });
  var h        = handlers || {};

  if (withData.length === 0) {
    return pickV(seed + "p0", [
      "No revenue history yet. Once you log the first month for any account, I can start tracking trends and flagging what's moving.",
      "Pipeline is blank. Log the first month for any account and I'll show you what's trending.",
    ]);
  }

  var momValues = withData
    .map(function (a) { return momPct(revenueHistory, a.id, "revenue"); })
    .filter(function (p) { return p !== null; });
  var avgMoM   = momValues.length > 0
    ? Math.round(momValues.reduce(function (s, p) { return s + p; }, 0) / momValues.length)
    : null;
  var down     = momValues.filter(function (p) { return p < 0; }).length;
  var up       = momValues.filter(function (p) { return p > 0; }).length;
  var atRisk   = accounts.filter(function (a) { return a.status === "red"; }).length;
  var watching = accounts.filter(function (a) { return a.status === "yellow"; }).length;

  // Hot phrases — only urgent stuff (declines, at-risk) glows.
  var downGlow   = <Glow onClick={h.onClickDown}>{down + " account" + (down !== 1 ? "s" : "") + " trending down"}</Glow>;
  var atRiskGlow = <Glow onClick={h.onClickAtRisk}>{atRisk + " account" + (atRisk !== 1 ? "s" : "") + " at risk"}</Glow>;

  var lead;
  if (avgMoM !== null) {
    lead = pickV(seed + "pl", [
      <>{withData.length} of {accounts.length} accounts reporting. Book is {avgMoM >= 0 ? "up" : "down"} {Math.abs(avgMoM)}% MoM on average.</>,
      <>Tracking {withData.length} account{withData.length !== 1 ? "s" : ""}. Average MoM: {avgMoM >= 0 ? "+" : ""}{avgMoM}%.</>,
    ]);
  } else {
    lead = <>{withData.length} of {accounts.length} accounts have revenue history logged.</>;
  }

  var middle = null;
  if (down > 0) {
    middle = pickV(seed + "ps", [
      <>{downGlow} — worth a look.</>,
      <>{downGlow}, {up} up. Address the declines before they compound.</>,
    ]);
  } else if (momValues.length > 0) {
    middle = pickV(seed + "ps", [
      "Everything with data is trending up. Don't jinx it.",
      up + " account" + (up !== 1 ? "s" : "") + " moving in the right direction.",
    ]);
  }

  var tail = null;
  if (atRisk > 0) {
    tail = pickV(seed + "pc", [
      <>{atRiskGlow}. Those need priority attention.</>,
      <>{atRiskGlow} — make sure they're getting face time before the number gets worse.</>,
    ]);
  } else if (watching > 0) {
    tail = watching + " account" + (watching !== 1 ? "s" : "") + " on watch. Keep tabs.";
  }

  return <>{lead}{middle ? <> {middle}</> : null}{tail ? <> {tail}</> : null}</>;
}

function getCurrentMonthYear() {
  var d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function LogMonthModal({ accounts, onUpsertRevenue, onUpsertShopMetrics, onClose }) {
  var now = getCurrentMonthYear();
  var [month, setMonth] = useState(now.month);
  var [year, setYear]   = useState(now.year);
  var [values, setValues] = useState({});
  var [saving, setSaving] = useState(false);

  var allMonths = MONTH_NAMES.map(function (m, i) { return { label: m, value: i + 1 }; });
  var years = [];
  for (var y = now.year; y >= now.year - 4; y--) years.push(y);

  function setVal(accountId, field, v) {
    setValues(function (prev) {
      var cur = prev[accountId] || {};
      return Object.assign({}, prev, { [accountId]: Object.assign({}, cur, { [field]: v }) });
    });
  }

  function handleSave() {
    var entries = Object.keys(values).filter(function (id) {
      var v = values[id];
      return v.revenue || v.connected != null;
    });
    if (entries.length === 0) { onClose(); return; }

    setSaving(true);
    var ops = [];
    entries.forEach(function (id) {
      var v = values[id];
      var rev = parseFloat((v.revenue || "").replace(/[^0-9.]/g, ""));
      if (!isNaN(rev) && rev >= 0) {
        ops.push(onUpsertRevenue(id, month, year, rev));
      }
      var c = parseInt(v.connected), intg = parseInt(v.integrated), nc = parseInt(v.no_connection);
      if (!isNaN(c) || !isNaN(intg) || !isNaN(nc)) {
        ops.push(onUpsertShopMetrics(id, month, year, isNaN(c) ? 0 : c, isNaN(intg) ? 0 : intg, isNaN(nc) ? 0 : nc));
      }
    });

    Promise.all(ops)
      .then(function () {
        setSaving(false);
        showToast("Month logged for " + entries.length + " account" + (entries.length > 1 ? "s" : ""));
        onClose();
      })
      .catch(function (err) {
        setSaving(false);
        showToast(err.message || "Couldn't save", "error");
      });
  }

  var isMso = accounts.filter(function (a) { return a.account_type === "mso"; }).length > 0;

  return (
    <Modal title={"Log Month · " + MONTH_NAMES[month - 1] + " " + year} onClose={onClose} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Month / Year pickers */}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <FL>Month</FL>
            <select
              value={month}
              onChange={function (e) { setMonth(parseInt(e.target.value)); }}
              style={{ width: "100%", background: C.bgDropdown, border: "1px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", outline: "none" }}
            >
              {allMonths.map(function (m) { return <option key={m.value} value={m.value}>{m.label}</option>; })}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <FL>Year</FL>
            <select
              value={year}
              onChange={function (e) { setYear(parseInt(e.target.value)); }}
              style={{ width: "100%", background: C.bgDropdown, border: "1px solid " + C.border, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", outline: "none" }}
            >
              {years.map(function (y) { return <option key={y} value={y}>{y}</option>; })}
            </select>
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px" + (isMso ? " 72px 72px 88px" : ""), gap: 8, paddingBottom: 4, borderBottom: "1px solid " + C.border }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Account</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "right" }}>Revenue</div>
          {isMso && <>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center" }}>Conn.</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center" }}>Intg.</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center" }}>No Conn.</div>
          </>}
        </div>

        {/* Account rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
          {accounts.map(function (a) {
            var v = values[a.id] || {};
            var hasMsoFields = a.account_type === "mso";
            return (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px" + (isMso ? " 72px 72px 88px" : ""), gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                <input
                  value={v.revenue || ""}
                  onChange={function (e) { setVal(a.id, "revenue", e.target.value); }}
                  placeholder="$0"
                  style={{ background: C.bgDropdown, border: "1px solid " + C.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", width: "100%", boxSizing: "border-box", textAlign: "right", outline: "none" }}
                />
                {isMso && <>
                  <input
                    value={v.connected || ""}
                    onChange={function (e) { setVal(a.id, "connected", e.target.value); }}
                    placeholder="—"
                    disabled={!hasMsoFields}
                    style={{ background: hasMsoFields ? C.bgDropdown : "transparent", border: "1px solid " + (hasMsoFields ? C.border : "transparent"), borderRadius: 6, padding: "6px 8px", fontSize: 12, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", width: "100%", boxSizing: "border-box", textAlign: "center", outline: "none" }}
                  />
                  <input
                    value={v.integrated || ""}
                    onChange={function (e) { setVal(a.id, "integrated", e.target.value); }}
                    placeholder="—"
                    disabled={!hasMsoFields}
                    style={{ background: hasMsoFields ? C.bgDropdown : "transparent", border: "1px solid " + (hasMsoFields ? C.border : "transparent"), borderRadius: 6, padding: "6px 8px", fontSize: 12, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", width: "100%", boxSizing: "border-box", textAlign: "center", outline: "none" }}
                  />
                  <input
                    value={v.no_connection || ""}
                    onChange={function (e) { setVal(a.id, "no_connection", e.target.value); }}
                    placeholder="—"
                    disabled={!hasMsoFields}
                    style={{ background: hasMsoFields ? C.bgDropdown : "transparent", border: "1px solid " + (hasMsoFields ? C.border : "transparent"), borderRadius: 6, padding: "6px 8px", fontSize: 12, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", width: "100%", boxSizing: "border-box", textAlign: "center", outline: "none" }}
                  />
                </>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
          <SecBtn onClick={onClose}>Cancel</SecBtn>
          <AmberBtn onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
            {saving ? "Saving…" : "Save Month"}
          </AmberBtn>
        </div>
      </div>
    </Modal>
  );
}

export function PipelineView({ accounts, loading, revenueHistory, shopMetrics, onUpsertRevenue, onUpsertShopMetrics }) {
  var [showLogMonth, setShowLogMonth] = useState(false);
  var [tierFilter, setTierFilter]     = useState(function() { return loadPipelinePrefs().tier || "All"; });
  var [statusFilter, setStatusFilter] = useState(function() { return loadPipelinePrefs().status || "All"; });
  var [revFilter, setRevFilter]       = useState(function() { return loadPipelinePrefs().revenue || "any"; });

  useEffect(function() { savePipelinePrefs(Object.assign(loadPipelinePrefs(), { tier: tierFilter, status: statusFilter, revenue: revFilter })); }, [tierFilter, statusFilter, revFilter]);

  var rev = revenueHistory || [];
  var sm  = shopMetrics    || [];

  var filteredAccounts = useMemo(function() {
    return accounts.filter(function(a) {
      if (tierFilter !== "All" && a.tier !== tierFilter) return false;
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (!matchRevenue(a.revenue_amount, revFilter)) return false;
      return true;
    });
  }, [accounts, tierFilter, statusFilter, revFilter]);

  var [sortByDecline, setSortByDecline] = useState(false);
  var pipelineInsight = buildPipelineInsight(accounts, rev, {
    onClickDown:   function () { setStatusFilter("All"); setTierFilter("All"); setRevFilter("any"); setSortByDecline(true); },
    onClickAtRisk: function () { setStatusFilter("red"); setSortByDecline(false); },
  });

  if (loading) {
    return <PipLoader />;
  }

  var withData    = filteredAccounts.filter(function (a) { return latestRecord(rev, a.id) !== null; });
  var withoutData = filteredAccounts.filter(function (a) { return latestRecord(rev, a.id) === null; });

  withData.sort(function (a, b) {
    if (sortByDecline) {
      var pa = momPct(rev, a.id, "revenue");
      var pb = momPct(rev, b.id, "revenue");
      return (pa === null ? 999 : pa) - (pb === null ? 999 : pb);
    }
    return latestRecord(rev, b.id).revenue - latestRecord(rev, a.id).revenue;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, color: C.accent, flexShrink: 0 }}>
            <NavMark id="pipeline" size={40} />
          </span>
          <div>
            <div style={{ fontFamily: PV_SERIF, fontSize: 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
              Pipeline
            </div>
            <div style={{ fontFamily: PV_MONO, fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
              Revenue · Trends · Shop Metrics
            </div>
          </div>
        </div>
        {onUpsertRevenue && (
          <button
            onClick={function () { setShowLogMonth(true); }}
            style={{
              background: C.accentDeep || C.accent, border: "none", borderRadius: 6,
              padding: "8px 14px", fontSize: 12, fontWeight: 600, color: C.bg,
              fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
            }}
          >
            + Log Month
          </button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <PipInsightCard segments={[pipelineInsight]} />
      </div>
      {sortByDecline && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={function () { setSortByDecline(false); }}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              borderRadius: 999, padding: "4px 12px",
              fontFamily: PV_MONO, fontSize: 10.5, color: C.accent, fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            Sorted by biggest declines
            <span style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}>×</span>
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 5, marginBottom: 6, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Tier</span>
        {["All", "Major", "Mid", "Growth"].map(function(t) {
          var active = tierFilter === t;
          return (
            <button key={t} onClick={function() { setTierFilter(t); }}
              style={{
                background: active ? C.accent : "transparent", color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule), borderRadius: 999,
                padding: "4px 11px", fontFamily: MONO, fontSize: 10.5, cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {t}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 6, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Status</span>
        {[{ id: "All", label: "All" }, { id: "green", label: "Healthy" }, { id: "yellow", label: "Watch" }, { id: "red", label: "At Risk" }].map(function(s) {
          var active = statusFilter === s.id;
          return (
            <button key={s.id} onClick={function() { setStatusFilter(s.id); }}
              style={{
                background: active ? C.accent : "transparent", color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule), borderRadius: 999,
                padding: "4px 11px", fontFamily: MONO, fontSize: 10.5, cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>Revenue</span>
        {REVENUE_RANGES.map(function(r) {
          var active = revFilter === r.id;
          return (
            <button key={r.id} onClick={function() { setRevFilter(r.id); }}
              style={{
                background: active ? C.accent : "transparent", color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule), borderRadius: 999,
                padding: "4px 11px", fontFamily: MONO, fontSize: 10.5, cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {r.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Accounts with revenue history */}
        {withData.map(function (a) {
          var latest     = latestRecord(rev, a.id);
          var mom        = momPct(rev, a.id, "revenue");
          var yoy        = yoyPct(rev, a.id, "revenue");
          var records    = accountRecords(rev, a.id);
          var monthLabel = latest ? MONTH_NAMES[latest.month - 1] + " " + latest.year : "";
          var shopLatest = latestRecord(sm, a.id);

          return (
            <div
              key={a.id}
              style={Object.assign({}, glass, { borderRadius: 12, padding: "12px 14px" })}
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

              {/* Shop metrics row */}
              {shopLatest && (
                <div style={{ display: "flex", gap: 10, marginTop: 8, paddingTop: 8, borderTop: "1px solid " + C.border }}>
                  {[
                    { label: "Connected",    value: shopLatest.connected,    color: C.green  },
                    { label: "Integrated",   value: shopLatest.integrated,   color: C.accent },
                    { label: "No Connection",value: shopLatest.no_connection, color: C.red   },
                  ].map(function (s) {
                    return (
                      <div key={s.label} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: C.textMuted }}>{s.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                      </div>
                    );
                  })}
                </div>
              )}
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
              style={Object.assign({}, glass, { borderRadius: 12, padding: "12px 14px", opacity: 0.55 })}
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
        {accounts.length > 0 && filteredAccounts.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
            No accounts match the active filters.
          </div>
        )}
      </div>

      {showLogMonth && (
        <LogMonthModal
          accounts={accounts}
          onUpsertRevenue={onUpsertRevenue}
          onUpsertShopMetrics={onUpsertShopMetrics}
          onClose={function () { setShowLogMonth(false); }}
        />
      )}
    </div>
  );
}
