import { useState } from "react";
import { C } from "../../lib/colors";
import { Pill } from "../../components/Pill";
import { InputField } from "../../components/InputField";
import { Card } from "../../components/Card";
import { PipMark } from "../../components/PipMark";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };
var STATUS_LABELS = { green: "Healthy", yellow: "Watch",  red: "At Risk" };
var TIER_COLORS   = { Major: C.blue,   Mid: C.purple,    Growth: C.green };
var TIER_ORDER    = { Major: 1, Mid: 2, Growth: 3 };

var FILTERS = ["All", "Major", "Mid", "Growth", "At Risk"];

function SkeletonCard() {
  return (
    <div
      style={{
        background: C.bgCard,
        border: "1px solid " + C.border,
        borderLeft: "3px solid " + C.border,
        borderRadius: 12,
        padding: "13px 15px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10, alignItems: "center" }}>
            <div style={{ width: 120, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.05)", animation: "skeleton-pulse 1.5s ease-in-out infinite" }} />
            <div style={{ width: 40, height: 14, borderRadius: 6, background: "rgba(255,255,255,0.04)", animation: "skeleton-pulse 1.5s ease-in-out infinite 0.2s" }} />
          </div>
          <div style={{ width: 70, height: 18, borderRadius: 6, background: "rgba(255,255,255,0.04)", animation: "skeleton-pulse 1.5s ease-in-out infinite 0.1s", marginBottom: 8 }} />
          <div style={{ width: 90, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.03)", animation: "skeleton-pulse 1.5s ease-in-out infinite 0.3s" }} />
        </div>
        <div style={{ width: 14, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />
      </div>
    </div>
  );
}

export function AccountsView({ accounts, loading, onSelect }) {
  var [search, setSearch]       = useState("");
  var [filter, setFilter]       = useState("All");
  var [tagFilter, setTagFilter] = useState(null);
  var [regionFilter, setRegionFilter] = useState(null);

  var todayStr   = new Date().toISOString().split("T")[0];
  var in7DaysStr = (function () {
    var d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0];
  })();

  var availableTags = loading ? [] : (function () {
    var seen = {};
    accounts.forEach(function (a) { (a.tags || []).forEach(function (t) { seen[t] = true; }); });
    return Object.keys(seen).sort();
  })();

  var availableRegions = loading ? [] : accounts
    .map(function (a) { return a.region; })
    .filter(function (r, i, arr) { return r && arr.indexOf(r) === i; })
    .sort();

  var upcoming = loading ? [] : accounts
    .filter(function (a) {
      return a.next_meeting && a.next_meeting >= todayStr && a.next_meeting <= in7DaysStr;
    })
    .sort(function (a, b) { return a.next_meeting.localeCompare(b.next_meeting); });

  var filtered = accounts
    .filter(function (a) {
      var matchSearch = a.name.toLowerCase().includes(search.toLowerCase());
      var matchFilter =
        filter === "All" ||
        (filter === "At Risk" ? a.status === "red" : a.tier === filter);
      var matchTag    = !tagFilter    || (a.tags && a.tags.includes(tagFilter));
      var matchRegion = !regionFilter || a.region === regionFilter;
      return matchSearch && matchFilter && matchTag && matchRegion;
    })
    .sort(function (a, b) {
      var tierDiff = (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9);
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    });

  return (
    <div>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {[
          { l: "Accounts", v: loading ? "—" : accounts.length, c: C.text },
          { l: "Watching", v: loading ? "—" : accounts.filter(function(a){ return a.status === "yellow"; }).length, c: C.yellow },
          { l: "At Risk",  v: loading ? "—" : accounts.filter(function(a){ return a.status === "red"; }).length, c: C.red },
        ].map(function (s) {
          return (
            <div
              key={s.l}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: s.c, fontVariantNumeric: "tabular-nums" }}>
                {s.v}
              </div>
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.l}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming meetings — Pip alert */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <PipMark size={7} color={C.accent} glow pulse />
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Pip — This Week
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcoming.map(function (a) {
              var statusColor = STATUS_COLORS[a.status] || C.textSub;
              var meetDate = new Date(a.next_meeting + "T12:00:00");
              var daysUntil = Math.round((new Date(a.next_meeting + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
              var dayLabel = daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : "In " + daysUntil + " days";
              return (
                <div
                  key={a.id}
                  onClick={function () { onSelect(a); }}
                  style={{
                    background: C.accentGlow,
                    border: "1px solid rgba(200,136,58,0.2)",
                    borderLeft: "3px solid " + C.accent,
                    borderRadius: 10,
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: C.textMuted }}>
                      {meetDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 4 }}>{dayLabel}</div>
                    <Pill color={statusColor}>{STATUS_LABELS[a.status] || a.status}</Pill>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <InputField
        value={search}
        onChange={function (e) { setSearch(e.target.value); }}
        placeholder="Search accounts..."
        style={{ marginBottom: 10 }}
      />

      {/* Filter pills — tier / status */}
      <div style={{ display: "flex", gap: 6, marginBottom: 6, overflowX: "auto", paddingBottom: 2 }}>
        {FILTERS.map(function (f) {
          var active = filter === f;
          return (
            <button
              key={f}
              onClick={function () { setFilter(f); }}
              style={{
                background: active ? C.bgPillActive : C.bgPill,
                color: active ? C.accent : C.textMuted,
                border: "1px solid " + (active ? "rgba(200,136,58,0.3)" : C.border),
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Filter pills — supplier type tags */}
      {availableTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 6, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", flexShrink: 0 }}>Type</span>
          {availableTags.map(function (t) {
            var active = tagFilter === t;
            return (
              <button
                key={t}
                onClick={function () { setTagFilter(active ? null : t); }}
                style={{
                  background: active ? "rgba(103,200,249,0.15)" : C.bgPill,
                  color: active ? C.blue : C.textMuted,
                  border: "1px solid " + (active ? "rgba(103,200,249,0.35)" : C.border),
                  borderRadius: 20,
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter pills — region */}
      {availableRegions.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", flexShrink: 0 }}>Region</span>
          {availableRegions.map(function (r) {
            var active = regionFilter === r;
            return (
              <button
                key={r}
                onClick={function () { setRegionFilter(active ? null : r); }}
                style={{
                  background: active ? "rgba(200,136,58,0.15)" : C.bgPill,
                  color: active ? C.accent : C.textMuted,
                  border: "1px solid " + (active ? "rgba(200,136,58,0.3)" : C.border),
                  borderRadius: 20,
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
      )}

      {/* Spacer when no tag/region rows */}
      {availableTags.length === 0 && availableRegions.length === 0 && (
        <div style={{ marginBottom: 8 }} />
      )}

      {/* Account list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
            No accounts found.
          </div>
        )}

        {!loading && filtered.map(function (a) {
          var statusColor = STATUS_COLORS[a.status] || C.textSub;

          var daysColor, daysLabel;
          var lastDate = a.last_interaction_at
            ? a.last_interaction_at.split("T")[0]
            : a.last_meeting;
          if (!lastDate) {
            daysColor = C.purple;
            daysLabel = "not met";
          } else {
            var days = Math.floor((new Date(todayStr + "T00:00:00") - new Date(lastDate + "T00:00:00")) / 86400000);
            daysLabel = days === 0 ? "today" : days + "d";
            daysColor = days <= 14 ? C.green : days <= 45 ? C.accent : C.red;
          }

          return (
            <div
              key={a.id}
              onClick={function () { onSelect(a); }}
              style={{
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderLeft: "3px solid " + statusColor,
                borderRadius: 12,
                padding: "13px 15px",
                cursor: "pointer",
                boxShadow: a.status === "red" ? "0 0 18px rgba(248,113,113,0.07)" : "none",
                transition: "opacity 0.12s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{a.name}</div>
                    {a.tier && <Pill color={TIER_COLORS[a.tier] || C.textSub}>{a.tier}</Pill>}
                    <Pill color={statusColor}>{STATUS_LABELS[a.status] || a.status}</Pill>
                    {a.region && <Pill color={C.accent}>{a.region}</Pill>}
                  </div>
                  {a.tags && a.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                      {a.tags.map(function (t) {
                        return <Pill key={t} color={C.blue}>{t}</Pill>;
                      })}
                    </div>
                  )}

                  {a.revenue && (
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
                      {a.revenue}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {a.last_meeting && (
                      <div style={{ fontSize: 10, color: C.textMuted }}>
                        {"Last: " + new Date(a.last_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                    {a.next_meeting && (
                      <div style={{ fontSize: 10, color: C.textSub }}>
                        {"Next: " + new Date(a.next_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, gap: 3 }}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: daysColor,
                    textShadow: "0 0 8px " + daysColor,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "0.02em",
                  }}>
                    {daysLabel}
                  </div>
                  <div style={{ fontSize: 13, color: C.textMuted }}>→</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
