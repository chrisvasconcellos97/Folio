import { useState, useMemo, useEffect } from "react";
import { C } from "../../lib/colors";
import { latestRecord, accountRecords, momPct, displayRevenue } from "../../lib/metricsUtils";
import { Pill } from "../../components/Pill";
import { InputField } from "../../components/InputField";
import { Card } from "../../components/Card";
import { PipOrb } from "../../components/PipMark";
import { PipLoader } from "../../components/PipLoader";
import { QuickTaskModal } from "../quicktasks/QuickTaskModal";
import { AmberBtn } from "../../components/Buttons";
import { QuickActionBar } from "../../components/QuickActionBar";
import { StatusBanner } from "../../components/StatusBanner";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

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

var FILTERS = ["All", "Major", "Mid", "Growth", "Watching", "At Risk"];

function SkeletonCard() {
  return (
    <div
      style={{
        background: C.surface,
        border: "1px solid " + C.rule,
        borderLeft: "3px solid " + C.rule,
        borderRadius: 6,
        padding: "11px 12px",
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

var WORKSPACE_COPY = {
  customer:      { addLabel: "+ Account",    emptyTitle: "Nothing in the field yet.",       emptyBody: "Add your first account and Pip will get to work. Start with your most important relationship.", emptyCTA: "+ Add Your First Account", noMatch: "No accounts match — try a different search or filter.", searchPlaceholder: "Search accounts, tags, regions...", noun: "account" },
  internal_team: { addLabel: "+ Department", emptyTitle: "No departments yet.",             emptyBody: "Departments are internal teams — marketing, sales, product, ops. Add one to start tracking cross-team work.", emptyCTA: "+ Add Your First Department", noMatch: "No departments match — try a different search or filter.", searchPlaceholder: "Search departments...", noun: "department" },
  partner:       { addLabel: "+ Partner",    emptyTitle: "No partners yet.",                emptyBody: "Partners are 3rd-party vendors, agencies, integrators. Add one to track agreements, scope, and spend.",                emptyCTA: "+ Add Your First Partner",    noMatch: "No partners match — try a different search or filter.",    searchPlaceholder: "Search partners...",    noun: "partner" },
};

function matchesTypeFilter(account, typeFilter) {
  var t = account.account_type;
  if (typeFilter === "internal_team") return t === "internal_team";
  if (typeFilter === "partner")       return t === "partner";
  // customer: legacy nulls + standard/mso/shop
  return !t || t === "standard" || t === "mso" || t === "shop";
}

export function AccountsView({ accounts, loading, onSelect, onAddAccount, tasks, addTask, updateTask, deleteTask, hasMeetings, hasCadences, revenueHistory, items, meetings, contacts, onColdClick, onOverdueClick, onFollowUpClick, onLogMeeting, typeFilter }) {
  var activeType = typeFilter || "customer";
  var copy = WORKSPACE_COPY[activeType] || WORKSPACE_COPY.customer;
  accounts = (accounts || []).filter(function (a) { return matchesTypeFilter(a, activeType); });
  var [search, setSearch]           = useState("");
  var [searchFocused, setSearchFocused] = useState(false);
  var [filter, setFilter]           = useState(function() { return loadPrefs().filter || "All"; });
  var [sortMode, setSortMode]       = useState(function() { return loadPrefs().sort || "tier"; });
  var [tagFilter, setTagFilter]     = useState(null);
  var [regionFilter, setRegionFilter] = useState(null);
  var [showAddTask, setShowAddTask] = useState(false);
  var [density, setDensity]         = useState(function() {
    try { return localStorage.getItem(DENSITY_KEY) || "comfortable"; } catch(e) { return "comfortable"; }
  });

  useEffect(function() { savePrefs(Object.assign(loadPrefs(), { filter: filter })); }, [filter]);
  useEffect(function() { savePrefs(Object.assign(loadPrefs(), { sort: sortMode })); }, [sortMode]);
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

  var accountIdsWithContactMatch = useMemo(function () {
    var set = {};
    var q = search.trim().toLowerCase();
    if (!q || !contacts) return set;
    contacts.forEach(function (c) {
      var match = (c.name && c.name.toLowerCase().includes(q))
        || (c.email && c.email.toLowerCase().includes(q))
        || (c.title && c.title.toLowerCase().includes(q));
      if (match) set[c.account_id] = true;
    });
    return set;
  }, [search, contacts]);

  var filtered = useMemo(function () {
    return accounts
      .filter(function (a) {
        var q = search.trim().toLowerCase();
        var matchSearch = !q
          || a.name.toLowerCase().includes(q)
          || (a.tags && a.tags.some(function(t) { return t.toLowerCase().includes(q); }))
          || (a.region && a.region.toLowerCase().includes(q))
          || (a.account_number && a.account_number.toLowerCase().includes(q))
          || (a.objective && a.objective.toLowerCase().includes(q))
          || accountIdsWithContactMatch[a.id];
        var matchFilter =
          filter === "All" ||
          (filter === "At Risk" ? a.status === "red" :
           filter === "Watching" ? a.status === "yellow" :
           a.tier === filter);
        var matchTag    = !tagFilter    || (a.tags && a.tags.includes(tagFilter));
        var matchRegion = !regionFilter || a.region === regionFilter;
        return matchSearch && matchFilter && matchTag && matchRegion;
      })
      .sort(function (a, b) {
        if (sortMode === "revenue") {
          var ra = a.revenue_amount != null ? Number(a.revenue_amount) : -1;
          var rb = b.revenue_amount != null ? Number(b.revenue_amount) : -1;
          if (ra !== rb) return rb - ra;
          return a.name.localeCompare(b.name);
        }
        if (sortMode === "name") {
          return a.name.localeCompare(b.name);
        }
        if (sortMode === "recent") {
          var la = a.last_interaction_at || a.last_meeting || "";
          var lb = b.last_interaction_at || b.last_meeting || "";
          if (la !== lb) return lb.localeCompare(la);
          return a.name.localeCompare(b.name);
        }
        var tierDiff = (TIER_ORDER[a.tier] || 9) - (TIER_ORDER[b.tier] || 9);
        if (tierDiff !== 0) return tierDiff;
        return a.name.localeCompare(b.name);
      });
  }, [accounts, search, filter, tagFilter, regionFilter, sortMode, accountIdsWithContactMatch]);

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

      {/* Status banner */}
      <StatusBanner
        accounts={accounts}
        items={items}
        meetings={meetings}
        onColdClick={onColdClick}
        onOverdueClick={onOverdueClick}
        onFollowUpClick={onFollowUpClick}
      />

      {/* Quick Action Bar */}
      <QuickActionBar
        accounts={accounts}
        onAddAccount={onAddAccount}
        onLogMeeting={onLogMeeting || function() { return Promise.resolve(); }}
        onAddTask={function(accountId, title) {
          return addTask({ title: title, account_id: accountId || undefined });
        }}
      />

      {/* Quick Task button (legacy - keep for direct task modal access) */}
      <button
        onClick={function () { setShowAddTask(true); }}
        style={{
          background: "transparent",
          border: "1px dashed " + C.rule,
          borderRadius: 6,
          padding: "7px 14px",
          marginBottom: openTasks.length > 0 ? 10 : 16,
          width: "100%",
          textAlign: "left",
          fontSize: 11,
          color: C.textMuted,
          fontFamily: "'Inter', system-ui, sans-serif",
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
            <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textSoft, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Quick Tasks
            </div>
            <div style={{
              background: "oklch(0.22 0.04 178 / 0.5)",
              border: "1px solid " + C.rule,
              borderRadius: 999,
              padding: "1px 7px",
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 400,
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
                  background: C.surface,
                  border: "1px solid " + (isOverdue ? C.redLine : C.rule),
                  borderLeft: "3px solid " + (isOverdue ? C.red : C.yellow),
                  borderRadius: 6,
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
                      border: "1px solid " + C.rule,
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
          gap: 6,
          marginBottom: 14,
        }}
      >
        {[
          { l: "Accounts", v: loading ? "—" : accounts.length, c: C.text, filterId: "All" },
          { l: "Watching", v: loading ? "—" : accounts.filter(function(a){ return a.status === "yellow"; }).length, c: C.yellow, filterId: "Watching" },
          { l: "At Risk",  v: loading ? "—" : accounts.filter(function(a){ return a.status === "red"; }).length, c: C.red, filterId: "At Risk" },
        ].map(function (s) {
          return (
            <div
              key={s.l}
              onClick={function() { setFilter(s.filterId); }}
              style={{
                background: filter === s.filterId ? C.accentFaint : C.surface,
                border: "1px solid " + (filter === s.filterId ? C.accentBorder : C.rule),
                borderRadius: 8,
                padding: "11px 12px",
                cursor: "pointer",
                transition: "border-color 0.12s, background 0.12s",
              }}
            >
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 400, color: s.c, fontFeatureSettings: '"tnum"' }}>
                {s.v}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
            <PipOrb size="xs" />
            <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                    background: C.accentFaint,
                    border: "1px solid " + C.accentLine,
                    borderLeft: "3px solid " + C.accent,
                    borderRadius: 6,
                    padding: "10px 14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 14, color: C.text, marginBottom: 2 }}>{a.name}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontFeatureSettings: '"tnum"' }}>
                      {meetDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, marginBottom: 4, fontFeatureSettings: '"tnum"' }}>{dayLabel}</div>
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
              placeholder={copy.searchPlaceholder}
              onFocus={function() { setSearchFocused(true); }}
              onBlur={function() {
                setTimeout(function() { setSearchFocused(false); }, 150);
                saveSearchHistory(search);
              }}
            />
          </div>
          <select
            value={sortMode}
            onChange={function(e) { setSortMode(e.target.value); }}
            title="Sort by"
            style={{
              background: "transparent", border: "1px solid " + C.rule, borderRadius: 6,
              padding: "5px 8px", color: C.textMuted, fontSize: 11,
              fontFamily: MONO, cursor: "pointer", flexShrink: 0,
            }}
          >
            <option value="tier">Tier</option>
            <option value="name">Name</option>
            <option value="revenue">Revenue</option>
            <option value="recent">Recent</option>
          </select>
          <button
            onClick={function() { setDensity(function(d) { return d === "comfortable" ? "compact" : "comfortable"; }); }}
            title={density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view"}
            style={{
              background: "transparent",
              border: "1px solid " + C.rule,
              borderRadius: 6,
              padding: "5px 9px",
              cursor: "pointer",
              color: C.textMuted,
              fontSize: 14,
              fontFamily: "'Inter', system-ui, sans-serif",
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
                    background: C.bgDropdown, border: "1px solid " + C.rule,
                    borderRadius: 999, padding: "3px 11px",
                    fontFamily: MONO, fontSize: 10.5,
                    color: C.textSoft, cursor: "pointer",
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
      <div style={{ display: "flex", gap: 5, marginBottom: 6, overflowX: "auto", paddingBottom: 2 }}>
        {FILTERS.map(function (f) {
          var active = filter === f;
          return (
            <button
              key={f}
              onClick={function () { setFilter(f); }}
              style={{
                background: active ? C.accent : "transparent",
                color: active ? C.bg : C.textMuted,
                border: "1px solid " + (active ? C.accent : C.rule),
                borderRadius: 999,
                padding: "4px 12px",
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 400,
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
        <div style={{ display: "flex", gap: 5, marginBottom: 6, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", flexShrink: 0 }}>Type</span>
          {availableTags.map(function (t) {
            var active = tagFilter === t;
            return (
              <button
                key={t}
                onClick={function () { setTagFilter(active ? null : t); }}
                style={{
                  background: active ? "rgba(91,143,212,0.15)" : "transparent",
                  color: active ? C.blue : C.textMuted,
                  border: "1px solid " + (active ? "rgba(91,143,212,0.35)" : C.rule),
                  borderRadius: 999,
                  padding: "4px 11px",
                  fontFamily: MONO,
                  fontSize: 10.5,
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
        <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", flexShrink: 0 }}>Region</span>
          {availableRegions.map(function (r) {
            var active = regionFilter === r;
            return (
              <button
                key={r}
                onClick={function () { setRegionFilter(active ? null : r); }}
                style={{
                  background: active ? C.accent : "transparent",
                  color: active ? C.bg : C.textMuted,
                  border: "1px solid " + (active ? C.accent : C.rule),
                  borderRadius: 999,
                  padding: "4px 11px",
                  fontFamily: MONO,
                  fontSize: 10.5,
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
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {loading && <PipLoader height={300} />}

        {!loading && accounts.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              {copy.emptyTitle}
            </div>
            <div style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6, marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>
              {copy.emptyBody}
            </div>
            {onAddAccount && (
              <AmberBtn onClick={onAddAccount} style={{ fontSize: 14, padding: "10px 24px" }}>
                {copy.emptyCTA}
              </AmberBtn>
            )}
          </div>
        )}

        {!loading && accounts.length > 0 && displayList.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
            {copy.noMatch}
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
                background: C.surface,
                border: "1px solid " + C.rule,
                borderRadius: 6,
                padding: isChild ? (isCompact ? "6px 10px" : "10px 12px") : (isCompact ? "8px 12px" : "11px 12px"),
                cursor: "pointer",
                userSelect: "none",
                transition: "opacity 0.12s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: (a.revenue_amount != null || a.revenue) || a.next_meeting ? 4 : 0 }}>
                    <div style={{
                      fontFamily: SERIF,
                      fontSize: isChild ? 13.5 : 15.5,
                      fontWeight: 400,
                      letterSpacing: "-0.005em",
                      color: isChild ? C.textSoft : C.text,
                    }}>
                      {a.name}
                    </div>
                    {a.tier && <Pill color={TIER_COLORS[a.tier] || C.textSoft}>{a.tier}</Pill>}
                  </div>
                  {((a.revenue_amount != null || a.revenue) || a.next_meeting) && !isCompact && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {(a.revenue_amount != null || a.revenue) && (
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontFeatureSettings: '"tnum"' }}>
                          {displayRevenue(a)}
                        </div>
                      )}
                      {a.next_meeting && (
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, fontFeatureSettings: '"tnum"' }}>
                          {"Next · " + new Date(a.next_meeting + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: daysColor,
                  fontFeatureSettings: '"tnum"',
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
                    fontFamily: MONO, fontSize: 9.5, color: C.accent,
                    background: C.accentFaint, border: '1px solid ' + C.accentLine,
                    borderRadius: 999, padding: '2px 8px', letterSpacing: '0.06em',
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
                  width: 24,
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "center",
                  paddingTop: 11,
                  borderLeft: "1px dashed " + C.accentBorder,
                  marginLeft: 10,
                  marginRight: 4,
                }}>
                  <span style={{ fontSize: 11, color: C.textFaint, lineHeight: 1 }}>↳</span>
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
