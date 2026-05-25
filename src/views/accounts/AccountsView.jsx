import { useState, useMemo, useEffect } from "react";
import { C } from "../../lib/colors";
import { latestRecord, accountRecords, momPct } from "../../lib/metricsUtils";
import { Pill } from "../../components/Pill";
import { InputField } from "../../components/InputField";
import { Card } from "../../components/Card";
import { PipMark } from "../../components/PipMark";
import { PipLoader } from "../../components/PipLoader";
import { QuickTaskModal } from "../quicktasks/QuickTaskModal";
import { AmberBtn } from "../../components/Buttons";

var DENSITY_KEY = "folio_density";

function loadSearchHistory() {
  try { return JSON.parse(localStorage.getItem("folio_search_history") || "[]"); } catch(e) { return []; }
}
function saveSearchHistory(query) {
  if (!query || !query.trim()) return;
  var history = loadSearchHistory().filter(function(h) { return h !== query.trim(); });
  history.unshift(query.trim());
  history = history.slice(0, 5);
  try { localStorage.setItem("folio_search_history", JSON.stringify(history)); } catch(e) {}
}

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

var PREF_KEY = "folio_acct_prefs";
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch(e) { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch(e) {}
}

export function AccountsView({ accounts, loading, onSelect, onAddAccount, tasks, addTask, updateTask, deleteTask, hasMeetings, hasCadences, revenueHistory }) {
  var [search, setSearch]           = useState("");
  var [searchFocused, setSearchFocused] = useState(false);
  var [filter, setFilter]           = useState(function() { return loadPrefs().filter || "All"; });
  var [tagFilter, setTagFilter]     = useState(null);
  var [regionFilter, setRegionFilter] = useState(null);
  var [showAddTask, setShowAddTask] = useState(false);
  var [density, setDensity]         = useState(function() {
    try { return localStorage.getItem(DENSITY_KEY) || "comfortable"; } catch(e) { return "comfortable"; }
  });

  useEffect(function() { savePrefs(Object.assign(loadPrefs(), { filter: filter })); }, [filter]);
  useEffect(function() {
    try { localStorage.setItem(DENSITY_KEY, density); } catch(e) {}
  }, [density]);
  var [editingTask, setEditingTask] = useState(null);

  // Checklist logic
  var checklistDone = (function() {
    try { return !!localStorage.getItem("folio_checklist_done"); } catch(e) { return true; }
  })();
  var allDone = accounts.length > 0 && !!hasMeetings && !!hasCadences;
  useEffect(function() {
    if (allDone) {
      try { localStorage.setItem("folio_checklist_done", "1"); } catch(e) {}
    }
  }, [allDone]);
  var showChecklist = !checklistDone && !allDone;

  var openTasks = (tasks || []).filter(function (t) { return !t.done; });

  var todayStr   = new Date().toISOString().split("T")[0];
  var in7DaysStr = (function () {
    var d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0];
  })();

  var availableTags = useMemo(function () {
    if (loading) return [];
    var seen = {};
    accounts.forEach(function (a) { (a.tags || []).forEach(function (t) { seen[t] = true; }); });
    return Object.keys(seen).sort();
  }, [loading, accounts]);

  var availableRegions = useMemo(function () {
    if (loading) return [];
    return accounts
      .map(function (a) { return a.region; })
      .filter(function (r, i, arr) { return r && arr.indexOf(r) === i; })
      .sort();
  }, [loading, accounts]);

  var upcoming = useMemo(function () {
    if (loading) return [];
    return accounts
      .filter(function (a) {
        return a.next_meeting && a.next_meeting >= todayStr && a.next_meeting <= in7DaysStr;
      })
      .sort(function (a, b) { return a.next_meeting.localeCompare(b.next_meeting); });
  }, [loading, accounts, todayStr, in7DaysStr]);

  var filtered = useMemo(function () {
    return accounts
      .filter(function (a) {
        var q = search.trim().toLowerCase();
        var matchSearch = !q
          || a.name.toLowerCase().includes(q)
          || (a.tags && a.tags.some(function(t) { return t.toLowerCase().includes(q); }))
          || (a.region && a.region.toLowerCase().includes(q))
          || (a.account_number && a.account_number.toLowerCase().includes(q))
          || (a.objective && a.objective.toLowerCase().includes(q));
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
  }, [accounts, search, filter, tagFilter, regionFilter]);

  // Build display list: parents in sort order, children nested immediately below
  var displayList = useMemo(function () {
    var list      = [];
    var addedIds  = {};
    filtered.filter(function (a) { return !a.parent_account_id; }).forEach(function (parent) {
      list.push({ account: parent, isChild: false });
      addedIds[parent.id] = true;
      filtered
        .filter(function (a) { return a.parent_account_id === parent.id; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (child) {
          if (parent.account_type !== 'mso') {
            list.push({ account: child, isChild: true });
          }
          addedIds[child.id] = true;
        });
    });
    filtered.forEach(function (a) {
      if (!addedIds[a.id]) list.push({ account: a, isChild: false });
    });
    return list;
  }, [filtered]);

  var shopCounts = useMemo(function () {
    var counts = {};
    accounts.forEach(function (a) {
      if (a.parent_account_id) {
        counts[a.parent_account_id] = (counts[a.parent_account_id] || 0) + 1;
      }
    });
    return counts;
  }, [accounts]);

  return (
    <div>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Quick Task button */}
      <button
        onClick={function () { setShowAddTask(true); }}
        style={{
          background: "transparent",
          border: "1px dashed " + C.border,
          borderRadius: 8,
          padding: "7px 14px",
          marginBottom: openTasks.length > 0 ? 10 : 16,
          width: "100%",
          textAlign: "left",
          fontSize: 11,
          color: C.textMuted,
          fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        Quick Task
      </button>

      {/* Quick Tasks tray */}
      {openTasks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Quick Tasks
            </div>
            <div style={{
              background: C.bgPillActive,
              border: "1px solid " + C.border,
              borderRadius: 10,
              padding: "1px 6px",
              fontSize: 9,
              fontWeight: 700,
              color: C.accent,
            }}>
              {openTasks.length}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {openTasks.map(function (t) {
              var isOverdue = t.reminder_at && new Date(t.reminder_at) < new Date();
              return (
                <div key={t.id} style={{
                  background: C.bgCard,
                  border: "1px solid " + (isOverdue ? "rgba(248,113,113,0.25)" : C.border),
                  borderLeft: "3px solid " + (isOverdue ? C.red : C.yellow),
                  borderRadius: 10,
                  padding: "9px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}>
                  <button
                    onClick={function () { updateTask(t.id, { done: true }); }}
                    title="Mark done"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "1px solid " + C.border,
                      background: "transparent",
                      cursor: "pointer",
                      flexShrink: 0,
                      padding: 0,
                    }}
                  />
                  <div
                    onClick={function () { setEditingTask(t); }}
                    style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                  >
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: C.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {t.title}
                    </div>
                    {(function () {
                      var acct = t.account_id ? (accounts || []).find(function (a) { return a.id === t.account_id; }) : null;
                      return acct ? (
                        <div style={{ fontSize: 10, color: C.accentDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
                          {acct.name}
                        </div>
                      ) : null;
                    })()}
                    {t.reminder_at && (
                      <div style={{ fontSize: 10, color: isOverdue ? C.red : C.textMuted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {"Reminder · " + new Date(t.reminder_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    )}
                    {t.notes && (
                      <div style={{
                        fontSize: 12,
                        color: C.textMuted,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {t.notes}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>
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
            <div style={{ fontSize: 10, color: C.accent, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
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
                    border: "1px solid " + C.accentLine,
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
                    <div style={{ fontSize: 10, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
                      {meetDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{dayLabel}</div>
                    <Pill color={statusColor}>{STATUS_LABELS[a.status] || a.status}</Pill>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + density toggle */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <InputField
              value={search}
              onChange={function (e) { setSearch(e.target.value); }}
              placeholder="Search accounts, tags, regions..."
              onFocus={function() { setSearchFocused(true); }}
              onBlur={function() {
                setTimeout(function() { setSearchFocused(false); }, 150);
                saveSearchHistory(search);
              }}
            />
          </div>
          <button
            onClick={function() { setDensity(function(d) { return d === "comfortable" ? "compact" : "comfortable"; }); }}
            title={density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view"}
            style={{
              background: "transparent",
              border: "1px solid " + C.border,
              borderRadius: 7,
              padding: "5px 9px",
              cursor: "pointer",
              color: C.textMuted,
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {density === "comfortable" ? "⊟" : "⊞"}
          </button>
        </div>
        {searchFocused && !search && loadSearchHistory().length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            {loadSearchHistory().map(function(h) {
              return (
                <button
                  key={h}
                  onClick={function() { setSearch(h); }}
                  style={{
                    background: C.bgPill, border: "1px solid " + C.border,
                    borderRadius: 20, padding: "3px 10px", fontSize: 11,
                    color: C.textSub, fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                  }}
                >
                  {h}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
                border: "1px solid " + (active ? C.accentSubtle : C.border),
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
          <span style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", flexShrink: 0 }}>Type</span>
          {availableTags.map(function (t) {
            var active = tagFilter === t;
            return (
              <button
                key={t}
                onClick={function () { setTagFilter(active ? null : t); }}
                style={{
                  background: active ? "rgba(123,108,246,0.15)" : C.bgPill,
                  color: active ? C.blue : C.textMuted,
                  border: "1px solid " + (active ? "rgba(123,108,246,0.35)" : C.border),
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
          <span style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", flexShrink: 0 }}>Region</span>
          {availableRegions.map(function (r) {
            var active = regionFilter === r;
            return (
              <button
                key={r}
                onClick={function () { setRegionFilter(active ? null : r); }}
                style={{
                  background: active ? C.accentMid : C.bgPill,
                  color: active ? C.accent : C.textMuted,
                  border: "1px solid " + (active ? C.accentSubtle : C.border),
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

      {/* New user checklist */}
      {showChecklist && (
        <div style={{
          background: C.accentFaint, border: "1px solid " + C.accentLine,
          borderRadius: 12, padding: "14px 16px", marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
            Getting started
          </div>
          {[
            { label: "Add your first account", done: accounts.length > 0 },
            { label: "Log a meeting", done: !!hasMeetings },
            { label: "Set a cadence", done: !!hasCadences },
          ].map(function(item) {
            return (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                  background: item.done ? C.accent : "transparent",
                  border: "1.5px solid " + (item.done ? C.accent : C.accentLine),
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {item.done && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 13, color: item.done ? C.textMuted : C.text, textDecoration: item.done ? "line-through" : "none" }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Account list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && <PipLoader height={300} />}

        {!loading && accounts.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              Nothing in the field yet.
            </div>
            <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6, marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>
              Add your first account and Pip will get to work. Start with your most important relationship.
            </div>
            {onAddAccount && (
              <AmberBtn onClick={onAddAccount} style={{ fontSize: 14, padding: "10px 24px" }}>
                + Add Your First Account
              </AmberBtn>
            )}
          </div>
        )}

        {!loading && accounts.length > 0 && displayList.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
            No accounts match — try a different search or filter.
          </div>
        )}

        {!loading && displayList.map(function (item, index) {
          var a           = item.account;
          var isChild     = item.isChild;
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

          var isCompact = density === "compact";
          var card = (
            <div
              onClick={function () { onSelect(a); }}
              role="button"
              tabIndex={0}
              onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(a); } }}
              style={{
                flex: isChild ? 1 : undefined,
                background: "rgba(18,40,36,0.82)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderLeft: "3px solid " + statusColor,
                borderRadius: 12,
                padding: isChild ? (isCompact ? "6px 10px" : "10px 12px") : (isCompact ? "8px 12px" : "12px 14px"),
                boxShadow: "0 4px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)",
                cursor: "pointer",
                userSelect: "none",
                transition: "opacity 0.12s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: a.revenue || a.next_meeting ? 4 : 0 }}>
                    <div style={{
                      fontSize: isChild ? 13 : 14,
                      fontWeight: 600,
                      color: isChild ? C.textSub : C.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {a.name}
                    </div>
                    {a.tier && <Pill color={TIER_COLORS[a.tier] || C.textSub}>{a.tier}</Pill>}
                  </div>
                  {(a.revenue || a.next_meeting) && !isCompact && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {a.revenue && (
                        <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
                          {a.revenue}
                        </div>
                      )}
                      {a.next_meeting && (
                        <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
                          {"Next · " + new Date(a.next_meeting + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: daysColor,
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}>
                  {daysLabel}
                </div>
              </div>
              {a.next_meeting && a.next_meeting < todayStr && (
                <div style={{ marginTop: 4 }}>
                  <Pill color={C.red}>Follow-up due</Pill>
                </div>
              )}
              {a.account_type === 'mso' && shopCounts[a.id] > 0 && !isCompact && (
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: C.accent,
                    background: C.accentGlow, border: '1px solid ' + C.accentLine,
                    borderRadius: 10, padding: '2px 8px', letterSpacing: '0.04em',
                  }}>
                    {shopCounts[a.id]} {shopCounts[a.id] === 1 ? 'shop' : 'shops'}
                  </div>
                </div>
              )}
              {!isCompact && (function() {
                var recs = accountRecords(revenueHistory || [], a.id).slice(-8);
                if (recs.length === 0) return null;
                var maxRev = Math.max.apply(null, recs.map(function(r) { return r.revenue; }));
                if (maxRev === 0) return null;
                var mom = momPct(revenueHistory || [], a.id, "revenue");
                var trendColor = mom === null ? C.textMuted : mom >= 0 ? C.green : C.red;
                var trendArrow = mom === null ? null : mom >= 0 ? "↑" : "↓";
                return (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 6 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 16 }}>
                      {recs.map(function(r, i) {
                        var h = Math.max(2, Math.round((r.revenue / maxRev) * 16));
                        var isLast = i === recs.length - 1;
                        return (
                          <div key={i} style={{ width: 3, height: h, background: isLast ? C.accent : C.accentDim, borderRadius: 1, opacity: isLast ? 0.9 : 0.4 }} />
                        );
                      })}
                    </div>
                    {trendArrow && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: trendColor, fontVariantNumeric: "tabular-nums" }}>
                        {trendArrow}{Math.abs(mom)}%
                      </span>
                    )}
                  </div>
                );
              })()}
              {a.address && !isCompact && (
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.address}
                </div>
              )}
            </div>
          );

          if (isChild) {
            return (
              <div key={a.id} className="list-item" style={{ display: "flex", alignItems: "flex-start", gap: 0, marginTop: -2, animationDelay: index * 0.04 + "s" }}>
                <div style={{
                  width: 28,
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "center",
                  paddingTop: 11,
                }}>
                  <span style={{ fontSize: 13, color: C.textMuted, opacity: 0.3, lineHeight: 1 }}>↳</span>
                </div>
                {card}
              </div>
            );
          }

          return <div key={a.id} className="list-item" style={{ animationDelay: index * 0.04 + "s" }}>{card}</div>;
        })}
      </div>

      {showAddTask && (
        <QuickTaskModal
          accounts={accounts}
          onSave={addTask}
          onClose={function () { setShowAddTask(false); }}
        />
      )}
      {editingTask && (
        <QuickTaskModal
          existing={editingTask}
          accounts={accounts}
          onSave={function (data) { return updateTask(editingTask.id, data); }}
          onDelete={deleteTask}
          onClose={function () { setEditingTask(null); }}
        />
      )}
    </div>
  );
}
