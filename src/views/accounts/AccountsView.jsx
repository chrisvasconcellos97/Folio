import { useState, useMemo, useEffect, useDeferredValue } from "react";
import { C } from "../../lib/colors";
import { ownerInitials, findOwner } from "../../lib/ownerLabel";
import { fmtShort } from "../../lib/dateUtils";
import { Mark } from "../../components/Mark";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { Pill } from "../../components/Pill";
import { InputField } from "../../components/InputField";
import { PipOrb } from "../../components/PipMark";
import { PipLoader } from "../../components/PipLoader";
import { QuickTaskModal } from "../quicktasks/QuickTaskModal";
import { Modal } from "../../components/Modal";
import { AmberBtn, SecBtn } from "../../components/Buttons";
import { computeAccountHealth, gatherSignals } from "../../lib/accountHealth";
import { HexSignature } from "../../lib/hexMotif";
import { EmptyState } from "../../components/EmptyState";

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

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red, new: C.textMuted };
var STATUS_LABELS = { green: "Healthy", yellow: "Watching", red: "At Risk", new: "New" };
// Tier accent colors — route through CSS vars so light theme can ship deeper
// hues per the light-theme spec (warm ochre, deep rose, indigo).
var TIER_COLORS   = { Major: "var(--c-tier-major)", Mid: "var(--c-tier-mid)", Growth: "var(--c-tier-growth)" };
var TIER_ORDER    = { Major: 1, Mid: 2, Growth: 3 };

// Tier-colored glow projecting off the card's left edge. Always shows in
// both themes now (used to be light-only). Tokens live in index.html.
var TIER_SHADOW = {
  Major:  "var(--c-tier-shadow-major)",
  Mid:    "var(--c-tier-shadow-mid)",
  Growth: "var(--c-tier-shadow-growth)",
};

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
            <div style={{ width: 120, height: 14, borderRadius: 6, background: "var(--c-input-fill)", animation: "skeleton-pulse 1.5s ease-in-out infinite" }} />
            <div style={{ width: 40, height: 14, borderRadius: 6, background: "var(--c-input-fill)", animation: "skeleton-pulse 1.5s ease-in-out infinite 0.2s" }} />
          </div>
          <div style={{ width: 70, height: 18, borderRadius: 6, background: "var(--c-input-fill)", animation: "skeleton-pulse 1.5s ease-in-out infinite 0.1s", marginBottom: 8 }} />
          <div style={{ width: 90, height: 10, borderRadius: 4, background: "var(--c-rule-soft)", animation: "skeleton-pulse 1.5s ease-in-out infinite 0.3s" }} />
        </div>
        <div style={{ width: 14, height: 14, borderRadius: 4, background: "var(--c-input-fill)" }} />
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
  var t = account.account_type || "";
  if (typeFilter === "internal_team") return t === "internal_team";
  if (typeFilter === "partner")       return t === "partner";
  if (typeFilter && typeFilter.startsWith("cws_")) {
    var wsId = typeFilter.slice(4);
    return account.custom_workspace_id === wsId;
  }
  // customer view: standard/mso/shop/null — but EXCLUDE accounts in a custom workspace
  return (!t || t === "standard" || t === "mso" || t === "shop") && !account.custom_workspace_id;
}

export function AccountsView({ accounts, allAccounts, loading, onSelect, onAddAccount, tasks, addTask, updateTask, deleteTask, hasMeetings, hasCadences, items, meetings, contacts, onColdClick, onOverdueClick, onFollowUpClick, onOpenConversation, typeFilter, onTypeFilterChange, userId, members, bannerFilter, onClearBannerFilter, customWorkspaces, addCustomWorkspace }) {
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;
  var activeType = typeFilter || "customer";
  var copy = WORKSPACE_COPY[activeType] || WORKSPACE_COPY.customer;
  accounts = (accounts || []).filter(function (a) { return matchesTypeFilter(a, activeType); });
  var [search, setSearch]           = useState("");
  // Deferred so the input stays responsive — heavy filter logic uses the
  // lagged value while typing.
  var deferredSearch = useDeferredValue(search);
  var [searchFocused, setSearchFocused] = useState(false);
  var [filter, setFilter]           = useState(function() { return loadPrefs().filter || "All"; });
  var [sortMode, setSortMode]       = useState(function() {
    var s = loadPrefs().sort;
    // Legacy "revenue" sort was ripped — fall back to default if persisted.
    if (s === "revenue") s = "tier";
    return s || "tier";
  });
  var mineKey = "folio_mine_only_" + (typeFilter || "customer");
  var [mineOnly, setMineOnly]       = useState(function () { try { return localStorage.getItem(mineKey) === "1"; } catch (e) { return false; } });
  useEffect(function () { try { localStorage.setItem(mineKey, mineOnly ? "1" : "0"); } catch (e) {} }, [mineOnly, mineKey]);
  var hideInactiveKey = "folio_hide_inactive_" + (typeFilter || "customer");
  var [hideInactive, setHideInactive] = useState(function () { try { return localStorage.getItem(hideInactiveKey) === "1"; } catch (e) { return false; } });
  useEffect(function () {
    try { localStorage.setItem(hideInactiveKey, hideInactive ? "1" : "0"); } catch (e) { /* localStorage may be unavailable */ }
  }, [hideInactive, hideInactiveKey]);
  var [tagFilter, setTagFilter]     = useState(null);
  var [regionFilter, setRegionFilter] = useState(null);
  var [showAddTask, setShowAddTask] = useState(false);
  var [density, setDensity]         = useState(function() {
    try { return localStorage.getItem(DENSITY_KEY) || "comfortable"; } catch(e) { return "comfortable"; }
  });
  var [filterOpen, setFilterOpen]   = useState(false);
  var [showNewWs, setShowNewWs]     = useState(false);
  var [newWsName, setNewWsName]     = useState("");
  var [newWsPortfolio, setNewWsPortfolio] = useState(false);
  var [savingWs, setSavingWs]       = useState(false);

  function handleCreateWs() {
    if (!newWsName.trim() || savingWs) return;
    setSavingWs(true);
    addCustomWorkspace(newWsName, newWsPortfolio)
      .then(function () {
        setShowNewWs(false);
        setNewWsName("");
        setSavingWs(false);
      })
      .catch(function () { setSavingWs(false); });
  }

  var activeFilterCount =
    (filter !== "All" ? 1 : 0) +
    (mineOnly ? 1 : 0) +
    (hideInactive ? 1 : 0) +
    (tagFilter ? 1 : 0) +
    (regionFilter ? 1 : 0);

  function clearAllFilters() {
    setFilter("All");
    setMineOnly(false);
    setHideInactive(false);
    setTagFilter(null);
    setRegionFilter(null);
    setSortMode("tier");
  }

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

  // Open items per account (uncompleted only)
  var openItemsByAccount = useMemo(function () {
    var map = {};
    (items || []).forEach(function (it) {
      if (it.done || !it.account_id) return;
      map[it.account_id] = (map[it.account_id] || 0) + 1;
    });
    return map;
  }, [items]);

  // Scope quick tasks to the current workspace. Unassigned tasks (no account_id)
  // live on /accounts only — they were created from the customer-facing tray.
  var accountTypeById = {};
  (accounts || []).forEach(function (a) { accountTypeById[a.id] = a.account_type || 'standard'; });
  function taskMatchesWorkspace(t) {
    var type = t.account_id ? accountTypeById[t.account_id] : null;
    if (typeFilter === 'internal_team') return type === 'internal_team';
    if (typeFilter === 'partner')       return type === 'partner';
    // customer view: customer types (standard/mso/shop/null) and unassigned
    if (!type) return true;
    return type !== 'internal_team' && type !== 'partner';
  }
  var openTasks = (tasks || []).filter(function (t) { return !t.done && taskMatchesWorkspace(t); });

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
    var map = {};
    var q = deferredSearch.trim().toLowerCase();
    if (!q || !contacts) return map;
    contacts.forEach(function (c) {
      if (map[c.account_id]) return; // keep only first match per account
      var match = (c.name && c.name.toLowerCase().includes(q))
        || (c.email && c.email.toLowerCase().includes(q))
        || (c.title && c.title.toLowerCase().includes(q));
      if (match) map[c.account_id] = { name: c.name || "", title: c.title || "" };
    });
    return map;
  }, [deferredSearch, contacts]);

  // Pre-compute health for every account once (feeds both filter and card render).
  var healthByAccount = useMemo(function () {
    var map = {};
    accounts.forEach(function (a) {
      var signals = gatherSignals(a, items, [], todayStr);
      map[a.id] = computeAccountHealth(a, signals);
    });
    return map;
  }, [accounts, items, todayStr]);

  var filtered = useMemo(function () {
    return accounts
      .filter(function (a) {
        var q = deferredSearch.trim().toLowerCase();
        var matchSearch = !q
          || a.name.toLowerCase().includes(q)
          || (a.tags && a.tags.some(function(t) { return t.toLowerCase().includes(q); }))
          || (a.region && a.region.toLowerCase().includes(q))
          || (a.account_number && a.account_number.toLowerCase().includes(q))
          || (a.objective && a.objective.toLowerCase().includes(q))
          || accountIdsWithContactMatch[a.id];
        var health = healthByAccount[a.id] || { status: "green" };
        var matchFilter =
          filter === "All" ||
          (filter === "At Risk" ? health.status === "red" :
           filter === "Watching" ? health.status === "yellow" :
           a.tier === filter);
        var matchTag    = !tagFilter    || (a.tags && a.tags.includes(tagFilter));
        var matchRegion = !regionFilter || a.region === regionFilter;
        var matchMine   = !mineOnly
          || a.owner_user_id === userId
          || (!a.owner_user_id && a.user_id === userId);
        var matchInactive = !hideInactive || !a.is_inactive;
        var matchBanner = true;
        if (bannerFilter === "cold") {
          var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime()
            : a.last_meeting ? new Date(a.last_meeting + "T00:00:00").getTime() : null;
          matchBanner = last === null || (Date.now() - last) > (30 * 86400000);
        } else if (bannerFilter === "overdue") {
          matchBanner = (items || []).some(function (i) { return i.account_id === a.id && !i.done && i.due_date && i.due_date < todayStr; });
        }
        return matchSearch && matchFilter && matchTag && matchRegion && matchMine && matchInactive && matchBanner;
      })
      .sort(function (a, b) {
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
  }, [accounts, deferredSearch, filter, tagFilter, regionFilter, sortMode, accountIdsWithContactMatch, mineOnly, hideInactive, userId, bannerFilter, items, todayStr, healthByAccount]);

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

  var customWsMatch = typeFilter && typeFilter.startsWith("cws_")
    ? (customWorkspaces || []).find(function (w) { return "cws_" + w.id === typeFilter; })
    : null;
  var workspaceTitle = customWsMatch ? customWsMatch.name
    : typeFilter === "internal_team" ? "Departments"
    : typeFilter === "partner"       ? "Partners"
    : "Accounts";
  var workspaceSubtitle = customWsMatch ? (customWsMatch.name + " · " + accounts.length + " Total")
    : typeFilter === "internal_team" ? "Internal Teams · " + (accounts.length) + " Total"
    : typeFilter === "partner"       ? "Partners · " + (accounts.length) + " Total"
    : "Customer Portfolio · " + (accounts.length) + " Total";
  var workspaceMarkId  = typeFilter === "internal_team" ? "departments"
                       : typeFilter === "partner"       ? "partners"
                       : "accounts";

  // Used to show the workspaces pill when multiple workspace types exist.
  // allAccounts is the full unfiltered list (passed from App.jsx).
  // Falls back to the already-filtered accounts if not provided.
  var allAccountsForPill = allAccounts || accounts || [];
  var hasDepartments = allAccountsForPill.some(function(a) { return a.account_type === 'internal_team'; });
  var hasPartners    = allAccountsForPill.some(function(a) { return a.account_type === 'partner'; });

  return (
    <div>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: isMobile ? 10 : 14 }}>
        <Mark tab={workspaceMarkId} size={isMobile ? 32 : 52} />
        <div>
          <div style={{ fontFamily: SERIF, fontSize: isMobile ? 26 : 40, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
            {workspaceTitle}
          </div>
          <div style={{ fontFamily: MONO, fontSize: isMobile ? 10 : 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>
            {workspaceSubtitle}
          </div>
        </div>
        {/* +Account lives here now (both mobile and desktop) — the rail's Add
            CTA and the mobile header's were removed in favor of this. */}
        {onAddAccount && (
          <AmberBtn onClick={onAddAccount} style={{ marginLeft: "auto", fontSize: isMobile ? 11 : 13, padding: isMobile ? "7px 12px" : "8px 16px", flexShrink: 0 }}>
            {typeFilter === "internal_team" ? "+ Department" : typeFilter === "partner" ? "+ Partner" : "+ Account"}
          </AmberBtn>
        )}
      </div>

      {/* Workspaces segmented pill — shows when Departments, Partners, or custom workspaces exist */}
      {(hasDepartments || hasPartners || (customWorkspaces && customWorkspaces.length > 0)) && onTypeFilterChange && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: "inline-flex", gap: 4, background: C.surface2,
            border: "1px solid " + C.rule, borderRadius: 12,
            padding: 3, flexWrap: "wrap",
          }}>
            {/* Built-in tabs */}
            {[
              { key: "customer",      label: "Customers" },
              ...(hasDepartments ? [{ key: "internal_team", label: "Departments" }] : []),
              ...(hasPartners    ? [{ key: "partner",       label: "Partners"     }] : []),
            ].map(function (tab) {
              var on = activeType === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={function () { onTypeFilterChange(tab.key); }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "none",
                    background: on ? C.surface : "transparent",
                    boxShadow: on ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                    color: on ? C.accent : C.textSoft,
                    fontFamily: MONO, fontSize: 11, fontWeight: on ? 700 : 400,
                    letterSpacing: "0.04em",
                    cursor: "pointer",
                    transition: "background 0.12s, color 0.12s",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}

            {/* Force second row for custom workspaces */}
            {(customWorkspaces && customWorkspaces.length > 0) && (
              <div style={{ flexBasis: "100%", height: 4 }} />
            )}

            {/* Custom workspace tabs */}
            {(customWorkspaces || []).map(function (ws) {
              var on = activeType === "cws_" + ws.id;
              return (
                <button
                  key={"cws_" + ws.id}
                  onClick={function () { onTypeFilterChange("cws_" + ws.id); }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "none",
                    background: on ? C.surface : "transparent",
                    boxShadow: on ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                    color: on ? C.accent : C.textSoft,
                    fontFamily: MONO, fontSize: 11, fontWeight: on ? 700 : 400,
                    letterSpacing: "0.04em",
                    cursor: "pointer",
                    transition: "background 0.12s, color 0.12s",
                  }}
                >
                  {ws.name}
                </button>
              );
            })}
            {addCustomWorkspace && (
              <button
                onClick={function () { setShowNewWs(true); }}
                style={{
                  padding: "4px 8px", borderRadius: 999,
                  background: "transparent",
                  border: "1px dashed " + C.rule,
                  color: C.textMuted,
                  fontFamily: MONO, fontSize: 10,
                  cursor: "pointer",
                }}
              >+</button>
            )}
          </div>
          {showNewWs && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <input
                autoFocus
                value={newWsName}
                onChange={function (e) { setNewWsName(e.target.value); }}
                onKeyDown={function (e) {
                  if (e.key === "Enter" && newWsName.trim() && !savingWs) handleCreateWs();
                  if (e.key === "Escape") { setShowNewWs(false); setNewWsName(""); }
                }}
                placeholder="Workspace name…"
                style={{
                  flex: 1, background: C.surface, border: "1px solid " + C.rule,
                  borderRadius: 6, padding: "6px 10px",
                  fontFamily: MONO, fontSize: 16, color: C.text, outline: "none",
                }}
              />
              <button
                onClick={handleCreateWs}
                disabled={!newWsName.trim() || savingWs}
                style={{
                  background: C.accent, border: "none", borderRadius: 6,
                  padding: "6px 12px", fontFamily: MONO, fontSize: 11,
                  color: C.bg, cursor: "pointer", opacity: !newWsName.trim() || savingWs ? 0.5 : 1,
                }}
              >
                {savingWs ? "…" : "Create"}
              </button>
              <button
                onClick={function () { setShowNewWs(false); setNewWsName(""); }}
                style={{
                  background: "transparent", border: "1px solid " + C.rule,
                  borderRadius: 6, padding: "6px 10px", fontFamily: MONO,
                  fontSize: 11, color: C.textMuted, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick Tasks tray — rows stay clean; the tray carries ONE signature */}
      {openTasks.length > 0 && (
        <div style={{ marginBottom: 16, position: "relative" }}>
          <HexSignature style={{ top: 0, right: 2, bottom: "auto" }} />
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
                    onClick={function () { updateTask(t.id, { done: true }); }}  /* folio_quick_tasks has no status column — done is its only completion flag */
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
                      fontFamily: SERIF,
                      fontSize: 15.5,
                      fontWeight: 400,
                      letterSpacing: "-0.005em",
                      lineHeight: 1.2,
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
                        <div style={{ fontFamily: MONO, fontSize: 10, color: C.accentDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>
                          {acct.name}
                        </div>
                      ) : null;
                    })()}
                    {t.reminder_at && (
                      <div style={{ fontFamily: MONO, fontSize: 10, color: isOverdue ? C.red : C.textMuted, marginTop: 3, letterSpacing: "0.04em", fontFeatureSettings: '"tnum"' }}>
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
              var upHealth = healthByAccount[a.id] || { status: "green" };
              var statusColor = STATUS_COLORS[upHealth.status] || C.textSub;
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
                      {/* eslint-ok: one-off locale format (weekday + month/day) */}
                      {meetDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, marginBottom: 4, fontFeatureSettings: '"tnum"' }}>{dayLabel}</div>
                    <Pill color={statusColor}>{STATUS_LABELS[upHealth.status] || upHealth.status}</Pill>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Big search + single Filter button. Density stays inline. */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="folio-search-wrap" style={{ flex: 1, position: "relative", padding: 4, margin: -4 }}>
            <span aria-hidden="true" style={{
              position: "absolute",
              left: 18, top: "50%", transform: "translateY(-50%)",
              color: C.accent, fontSize: 16, lineHeight: 1, pointerEvents: "none",
              zIndex: 1,
            }}>⌕</span>
            <InputField
              value={search}
              onChange={function (e) { setSearch(e.target.value); }}
              placeholder={copy.searchPlaceholder}
              ariaLabel={copy.searchPlaceholder || "Search accounts"}
              onFocus={function() { setSearchFocused(true); }}
              onBlur={function() {
                setTimeout(function() { setSearchFocused(false); }, 150);
                saveSearchHistory(search);
              }}
              style={{
                paddingLeft: 38,
                paddingTop: 13, paddingBottom: 13,
                border: "1px solid " + C.accent,
                boxShadow: searchFocused
                  ? "0 0 0 1px " + C.accent + ", 0 0 28px " + C.folioShadow + ", 0 0 10px " + C.folioShadow
                  : "0 0 18px " + C.folioShadow + ", 0 0 6px " + C.folioShadow,
                transition: "box-shadow 0.2s ease",
              }}
            />
          </div>
          <button
            onClick={function () { setFilterOpen(true); }}
            aria-label="Open filters"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: activeFilterCount > 0 ? C.accentFaint : "transparent",
              border: "1px solid " + (activeFilterCount > 0 ? C.accentBorder : C.rule),
              borderRadius: 8,
              padding: "10px 14px",
              color: activeFilterCount > 0 ? C.accent : C.textSoft,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 13, fontWeight: 600,
              cursor: "pointer", flexShrink: 0,
              minHeight: 44,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>⇅</span>
            Filter
            {activeFilterCount > 0 && (
              <span style={{
                fontFamily: MONO, fontSize: 10, fontWeight: 700,
                background: C.accent, color: C.bg,
                borderRadius: 999, padding: "1px 7px",
                fontVariantNumeric: "tabular-nums",
              }}>{activeFilterCount}</span>
            )}
          </button>
          <button
            onClick={function() { setDensity(function(d) { return d === "comfortable" ? "compact" : "comfortable"; }); }}
            title={density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view"}
            aria-label={density === "comfortable" ? "Switch to compact view" : "Switch to comfortable view"}
            aria-pressed={density === "compact"}
            style={{
              background: "transparent",
              border: "1px solid " + C.rule,
              borderRadius: 8,
              padding: "10px 12px",
              cursor: "pointer",
              color: C.textMuted,
              fontSize: 16,
              fontFamily: "'Inter', system-ui, sans-serif",
              lineHeight: 1,
              flexShrink: 0,
              minWidth: 44, minHeight: 44,
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

      {bannerFilter && onClearBannerFilter && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={onClearBannerFilter}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine,
              borderRadius: 999, padding: "4px 12px",
              fontFamily: MONO, fontSize: 10.5, color: C.accent, fontWeight: 600,
              cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            {bannerFilter === "cold" ? "Showing cold accounts" : "Showing accounts with overdue items"}
            <span style={{ fontSize: 13, lineHeight: 1, opacity: 0.7 }}>×</span>
          </button>
        </div>
      )}

      {/* Active filter chips — render only when filters are set. Each chip
          clears its filter on click. Tier/status, mine, hide inactive, tag,
          region all share one row. */}
      {activeFilterCount > 0 && (
        <div style={{ display: "flex", gap: 5, marginBottom: 10, overflowX: "auto", paddingBottom: 2, alignItems: "center" }}>
          {filter !== "All" && (
            <button
              onClick={function () { setFilter("All"); }}
              style={{
                background: C.accentFaint, color: C.accent,
                border: "1px solid " + C.accentLine, borderRadius: 999,
                padding: "3px 10px", fontFamily: MONO, fontSize: 10.5,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {filter} ×
            </button>
          )}
          {mineOnly && (
            <button
              onClick={function () { setMineOnly(false); }}
              style={{
                background: C.accentFaint, color: C.accent,
                border: "1px solid " + C.accentLine, borderRadius: 999,
                padding: "3px 10px", fontFamily: MONO, fontSize: 10.5,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Mine ×
            </button>
          )}
          {hideInactive && (
            <button
              onClick={function () { setHideInactive(false); }}
              style={{
                background: C.accentFaint, color: C.accent,
                border: "1px solid " + C.accentLine, borderRadius: 999,
                padding: "3px 10px", fontFamily: MONO, fontSize: 10.5,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Hide inactive ×
            </button>
          )}
          {tagFilter && (
            <button
              onClick={function () { setTagFilter(null); }}
              style={{
                background: C.accentFaint, color: C.accent,
                border: "1px solid " + C.accentLine, borderRadius: 999,
                padding: "3px 10px", fontFamily: MONO, fontSize: 10.5,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {tagFilter} ×
            </button>
          )}
          {regionFilter && (
            <button
              onClick={function () { setRegionFilter(null); }}
              style={{
                background: C.accentFaint, color: C.accent,
                border: "1px solid " + C.accentLine, borderRadius: 999,
                padding: "3px 10px", fontFamily: MONO, fontSize: 10.5,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {regionFilter} ×
            </button>
          )}
          <button
            onClick={clearAllFilters}
            style={{
              background: "transparent", color: C.textMuted,
              border: "none", padding: "3px 8px",
              fontFamily: MONO, fontSize: 10, cursor: "pointer",
              letterSpacing: "0.06em", textTransform: "uppercase",
            }}
          >
            Clear all
          </button>
        </div>
      )}
      {activeFilterCount === 0 && <div style={{ marginBottom: 8 }} />}

      {/* Account list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {loading && <PipLoader height={300} />}

        {!loading && accounts.length === 0 && (
          <EmptyState
            icon="📋"
            title={copy.emptyTitle}
            subtitle={copy.emptyBody}
            cta={onAddAccount && (
              <AmberBtn onClick={onAddAccount} style={{ fontSize: 14, padding: "10px 24px" }}>
                {copy.emptyCTA}
              </AmberBtn>
            )}
          />
        )}

        {!loading && accounts.length > 0 && displayList.length === 0 && (
          <EmptyState title={copy.noMatch} lattice={false} compact />
        )}

        {!loading && displayList.map(function (item, index) {
          var a           = item.account;
          var isChild     = item.isChild;
          var health      = healthByAccount[a.id] || { status: "green", reason: "on track", pinned: false };
          var statusColor = STATUS_COLORS[health.status] || C.textSub;

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
          var isInactive = !!a.is_inactive;
          var tierShadow = isInactive ? undefined : TIER_SHADOW[a.tier];
          var ariaLabel = a.name
            + (a.tier ? ", " + a.tier + " tier" : "")
            + (health.status ? ", " + (STATUS_LABELS[health.status] || health.status) : "")
            + (isInactive ? ", inactive" : "");
          var card = (
            <div
              onClick={function () { onSelect(a); }}
              className="acct-card"
              role="button"
              tabIndex={0}
              aria-label={ariaLabel}
              onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(a); } }}
              style={{
                flex: isChild ? 1 : undefined,
                position: "relative",
                overflow: "hidden",
                background: C.surface,
                border: "1px solid " + C.rule,
                borderLeft: a.is_my_department && !isInactive
                  ? "3px solid " + C.accent
                  : !isInactive && health.status !== "green" && health.status !== "new"
                    ? "3px solid " + (STATUS_COLORS[health.status] || C.rule)
                    : TIER_COLORS[a.tier] && !isInactive ? "3px solid " + TIER_COLORS[a.tier] : "1px solid " + C.rule,
                borderRadius: 6,
                padding: isChild ? (isCompact ? "6px 10px" : "10px 12px") : (isCompact ? "8px 12px" : "11px 12px"),
                cursor: "pointer",
                userSelect: "none",
                transition: "opacity 0.12s",
                boxShadow: tierShadow || undefined,
                opacity: isInactive ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: SERIF,
                    fontSize: isChild ? 13.5 : 15.5,
                    fontWeight: 400,
                    letterSpacing: "-0.005em",
                    lineHeight: 1.2,
                    color: isChild ? C.textSoft : C.text,
                    marginBottom: 4,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span>{a.name}</span>
                    {isInactive && (
                      <span style={{
                        fontFamily: MONO, fontSize: 9, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        color: C.yellow,
                        background: "transparent",
                        border: "1px solid " + C.yellow,
                        borderRadius: 999, padding: "1px 6px",
                        lineHeight: 1.2,
                      }}>
                        {a.merged_into_account_id ? "Merged" : "Inactive"}
                      </span>
                    )}
                    {health.pinned && !isInactive && (
                      <span style={{
                        fontFamily: MONO, fontSize: 8, fontWeight: 700,
                        color: C.textMuted, letterSpacing: "0.06em",
                        lineHeight: 1.2,
                      }}>📌</span>
                    )}
                  </div>
                  {/* Health micro caption — only when not green/new */}
                  {!isInactive && health.status !== "green" && health.status !== "new" && (
                    <div style={{
                      fontFamily: MONO, fontSize: 9, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.1em",
                      color: STATUS_COLORS[health.status] || C.textMuted,
                      marginBottom: 2, lineHeight: 1,
                    }}>
                      {health.reason.toUpperCase()}
                    </div>
                  )}

                  {/* Contact search match indicator */}
                  {(function () {
                    var q = deferredSearch.trim().toLowerCase();
                    var cm = accountIdsWithContactMatch[a.id];
                    if (!cm || !q) return null;
                    var nameMatch = a.name.toLowerCase().includes(q);
                    if (nameMatch) return null;
                    return (
                      <div style={{
                        fontFamily: MONO, fontSize: 9, color: C.accent,
                        textTransform: "uppercase", letterSpacing: "0.08em",
                        marginBottom: 2, lineHeight: 1,
                      }}>
                        Contact: {cm.name}{cm.title ? " · " + cm.title : ""}
                      </div>
                    );
                  })()}

                  {/* Compact mode hides the meta row but tier is color-only on
                      the left stripe — show a small tier label so color-blind
                      and screen-reader users get the signal too. */}
                  {isCompact && a.tier && (
                    <div style={{
                      fontFamily: MONO, fontSize: 9.5,
                      color: TIER_COLORS[a.tier] || C.textMuted,
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      marginBottom: 2,
                    }}>
                      {a.tier}
                    </div>
                  )}

                  {!isCompact && (function () {
                    var bits = [];
                    if (a.is_my_department) bits.unshift({ text: "MY TEAM", color: C.accent });
                    if (a.tier)    bits.push({ text: a.tier, color: TIER_COLORS[a.tier] || C.textSoft });
                    if (a.region)  bits.push({ text: a.region, color: C.textMuted });
                    if (a.account_type === 'mso')  bits.push({ text: "MSO", color: C.accent });
                    if (a.account_type === 'mso' && shopCounts[a.id] > 0) bits.push({ text: shopCounts[a.id] + " " + (shopCounts[a.id] === 1 ? "shop" : "shops"), color: C.accentDim });
                    (a.tags || []).forEach(function (t) { bits.push({ text: t, color: C.textMuted }); });
                    if (bits.length === 0) return null;
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0, marginBottom: 3, fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {bits.map(function (b, i) {
                          return (
                            <span key={i} style={{ color: b.color }}>
                              {i > 0 && <span style={{ color: C.textMuted, opacity: 0.6, margin: "0 6px" }}>·</span>}
                              {b.text}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {!isCompact && (function () {
                    var openCount  = openItemsByAccount[a.id] || 0;
                    if (!a.next_meeting && openCount === 0) return null;
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.04em", fontFeatureSettings: '"tnum"' }}>
                        {a.next_meeting && (
                          <span style={{ color: a.next_meeting < todayStr ? C.red : C.textMuted }}>
                            {(a.next_meeting < todayStr ? "Overdue · " : "Next · ") + fmtShort(a.next_meeting)}
                          </span>
                        )}
                        {openCount > 0 && (
                          <>
                            {a.next_meeting && <span style={{ color: C.textMuted, opacity: 0.6, margin: "0 6px" }}>·</span>}
                            <span style={{ color: C.yellow }}>
                              {openCount + " open"}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })()}
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
                {members && members.length > 1 && (function () {
                  var owner = findOwner(members, a.owner_user_id) || findOwner(members, a.user_id);
                  if (!owner) return null;
                  var isMine = (a.owner_user_id || a.user_id) === userId;
                  return (
                    <div
                      title={"Owner: " + (owner.invited_email || "Team member")}
                      style={{
                        fontFamily: MONO, fontSize: 9.5, fontWeight: 600,
                        color: isMine ? C.accent : C.textMuted,
                        background: isMine ? C.accentFaint : C.surface2,
                        border: "1px solid " + (isMine ? C.accentLine : C.rule),
                        borderRadius: 999, padding: "2px 7px",
                        letterSpacing: "0.04em", flexShrink: 0,
                      }}
                    >
                      {ownerInitials(owner)}
                    </div>
                  );
                })()}
              </div>
              {a.address && !isCompact && (
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.address}
                </div>
              )}
              {!isCompact && <HexSignature />}
            </div>
          );

          if (isChild) {
            return (
              <div key={a.id} className="list-item acct-child" style={{
                animationDelay: index * 0.04 + "s",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  color: C.textMuted, fontFamily: MONO, fontSize: 14,
                  flexShrink: 0, paddingLeft: 4, opacity: 0.55,
                }}>
                  ↳
                </span>
                <div style={{ flex: 1 }}>{card}</div>
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

      {filterOpen && (
        <Modal title="Filter" onClose={function () { setFilterOpen(false); }} width={420}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Tier / status */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Tier / Status
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {FILTERS.map(function (f) {
                  var active = filter === f;
                  var tint   = TIER_COLORS[f] || (f === "Watching" ? C.yellow : f === "At Risk" ? C.red : null);
                  return (
                    <button
                      key={f}
                      onClick={function () { setFilter(f); }}
                      style={{
                        background: active ? (tint || C.accent) : "transparent",
                        color: active ? C.bg : (tint || C.textMuted),
                        border: "1px solid " + (active ? (tint || C.accent) : (tint || C.rule)),
                        borderRadius: 999,
                        padding: "6px 14px",
                        fontFamily: MONO, fontSize: 11,
                        cursor: "pointer", whiteSpace: "nowrap",
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {tint && (
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: tint, display: "inline-block" }} />
                      )}
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mine / hide inactive */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {members && members.length > 1 && (
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.text }}>
                  <input
                    type="checkbox"
                    checked={mineOnly}
                    onChange={function (e) { setMineOnly(e.target.checked); }}
                    style={{ width: 16, height: 16, accentColor: C.accent }}
                  />
                  Show only accounts I own
                </label>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.text }}>
                <input
                  type="checkbox"
                  checked={hideInactive}
                  onChange={function (e) { setHideInactive(e.target.checked); }}
                  style={{ width: 16, height: 16, accentColor: C.accent }}
                />
                Hide inactive accounts
              </label>
            </div>

            {/* Sort */}
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Sort by
              </div>
              <select
                value={sortMode}
                onChange={function (e) { setSortMode(e.target.value); }}
                aria-label="Sort accounts by"
                style={{
                  width: "100%", background: C.bgDropdown,
                  border: "1px solid " + C.rule, borderRadius: 8,
                  padding: "10px 12px", color: C.text,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  outline: "none", cursor: "pointer",
                }}
              >
                <option value="tier">Tier</option>
                <option value="name">Name</option>
                <option value="recent">Most recent</option>
              </select>
            </div>

            {/* Tags */}
            {availableTags.length > 0 && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Type
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                          padding: "5px 12px",
                          fontFamily: MONO, fontSize: 11,
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Regions */}
            {availableRegions.length > 0 && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Region
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                          padding: "5px 12px",
                          fontFamily: MONO, fontSize: 11,
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <SecBtn onClick={clearAllFilters} style={{ fontSize: 12 }}>Clear all</SecBtn>
              <AmberBtn onClick={function () { setFilterOpen(false); }} style={{ fontSize: 12 }}>Done</AmberBtn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
