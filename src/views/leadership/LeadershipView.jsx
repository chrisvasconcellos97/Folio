import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { C, glass } from "../../lib/colors";
import { Card } from "../../components/Card";
import { FolioIcon } from "../../components/FolioIcon";
import { PipMark } from "../../components/PipMark";
import { gatherSignals, computeAccountHealth } from "../../lib/accountHealth";
import { fmtRelative } from "../../lib/dateUtils";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red, new: C.textMuted };

var EVENT_LABELS = {
  meeting_logged:       "logged a meeting",
  item_added:          "added a task",
  item_completed:      "completed a task",
  contact_added:       "added a contact",
  gauge_status_changed: "updated a Gauge project",
  account_status_changed: "changed account status",
};

function timeAgo(ts) {
  return fmtRelative(ts); // shared relative-time layer (was a local reimplementation)
}

function daysSince(ts) {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

function AccountCard({ account, openItemCount, health }) {
  var days       = daysSince(account.last_interaction_at || account.last_meeting);
  var isGoing    = days !== null && days >= 30;
  var statusColor = STATUS_COLORS[health || account.status] || C.textMuted;

  return (
    <div
      style={Object.assign({}, glass, {
        border: "1px solid " + (isGoing ? C.yellow + "55" : C.rule),
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      })}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
          {account.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {account.tier && (
            <span style={{ fontSize: 9, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {account.tier}
            </span>
          )}
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ fontSize: 11, color: days !== null && days < 14 ? C.textSub : days >= 30 ? C.yellow : C.textMuted, fontVariantNumeric: "tabular-nums" }}>
          {days === null ? "No contact" : days === 0 ? "Today" : days + "d since contact"}
        </div>
        {openItemCount > 0 && (
          <div style={{ fontSize: 11, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
            {openItemCount} open {openItemCount === 1 ? "item" : "items"}
          </div>
        )}
      </div>

      {isGoing && (
        <div style={{ fontSize: 10, fontWeight: 700, color: C.yellow, letterSpacing: "0.04em" }}>
          ⚠ Going cold
        </div>
      )}
    </div>
  );
}

export function LeadershipView({ org, orgId, userMeta, onSignOut }) {
  var [accounts, setAccounts]     = useState([]);
  var [items, setItems]           = useState([]);
  var [activity, setActivity]     = useState([]);
  var [members, setMembers]       = useState([]);
  var [loading, setLoading]       = useState(true);
  var [sortBy, setSortBy]         = useState("status"); // "status" | "cold" | "items"

  useEffect(function () {
    if (!orgId) return;
    setLoading(true);

    var p1 = supabase
      .from("folio_accounts")
      .select("*")
      .eq("org_id", orgId)
      .order("name")
      .then(function (r) { return r.data || []; });

    var p2 = supabase
      .from("folio_tasks")
      .select("account_id, due_date")
      .eq("done", false)
      .then(function (r) { return r.data || []; });

    var p3 = supabase
      .from("folio_activity")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(function (r) { return r.data || []; });

    var p4 = supabase
      .from("folio_org_members")
      .select("*")
      .eq("org_id", orgId)
      .eq("accepted", true)
      .then(function (r) { return r.data || []; });

    Promise.all([p1, p2, p3, p4]).then(function (results) {
      // Exclude archived + merged accounts so they don't inflate the portfolio,
      // "going cold", or the grid (every other surface filters these).
      var activeAccounts = (results[0] || []).filter(function (a) {
        return !a.is_inactive && !a.merged_into_account_id;
      });
      var activeIds = {};
      activeAccounts.forEach(function (a) { activeIds[a.id] = true; });
      setAccounts(activeAccounts);
      // Only count open items belonging to a visible account (cross-user team
      // tasks become visible via the folio_tasks org-read RLS policy).
      setItems((results[1] || []).filter(function (t) { return t.account_id && activeIds[t.account_id]; }));
      setActivity(results[2]);
      setMembers(results[3]);
      setLoading(false);
    });
  }, [orgId]);

  // Build open-item counts per account
  var itemCounts = useMemo(function () {
    var counts = {};
    items.forEach(function (item) {
      counts[item.account_id] = (counts[item.account_id] || 0) + 1;
    });
    return counts;
  }, [items]);

  // Computed health per account (green/yellow/red/new) — matches what AMs see,
  // instead of the legacy stored `status` column.
  var healthByAccount = useMemo(function () {
    var todayISO = new Date().toISOString().slice(0, 10);
    var itemsAsTasks = items.map(function (t) { return { account_id: t.account_id, done: false, due_date: t.due_date }; });
    var map = {};
    accounts.forEach(function (a) {
      var signals = gatherSignals(a, itemsAsTasks, [], todayISO);
      map[a.id] = computeAccountHealth(a, signals).status;
    });
    return map;
  }, [accounts, items]);

  var goingCold = useMemo(function () {
    return accounts.filter(function (a) {
      var d = daysSince(a.last_interaction_at || a.last_meeting);
      return d !== null && d >= 30;
    });
  }, [accounts]);

  var sorted = useMemo(function () {
    var list = accounts.slice();
    var STATUS_ORDER = { red: 0, yellow: 1, green: 2, new: 3 };
    if (sortBy === "status") {
      list.sort(function (a, b) {
        return (STATUS_ORDER[healthByAccount[a.id]] ?? 3) - (STATUS_ORDER[healthByAccount[b.id]] ?? 3);
      });
    } else if (sortBy === "cold") {
      list.sort(function (a, b) {
        var da = daysSince(a.last_interaction_at || a.last_meeting) ?? -1;
        var db = daysSince(b.last_interaction_at || b.last_meeting) ?? -1;
        return db - da;
      });
    } else if (sortBy === "items") {
      list.sort(function (a, b) {
        return (itemCounts[b.id] || 0) - (itemCounts[a.id] || 0);
      });
    }
    return list;
  }, [accounts, sortBy, itemCounts, healthByAccount]);

  var totalOpen = items.length;

  var topByItems = useMemo(function () {
    return accounts
      .filter(function (a) { return (itemCounts[a.id] || 0) > 0; })
      .sort(function (a, b) { return (itemCounts[b.id] || 0) - (itemCounts[a.id] || 0); })
      .slice(0, 5);
  }, [accounts, itemCounts]);

  // Build member email map for activity feed
  var memberMap = useMemo(function () {
    var map = {};
    members.forEach(function (m) { if (m.user_id) map[m.user_id] = m.invited_email || m.user_id; });
    return map;
  }, [members]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {/* Header */}
      <div style={{
        background: C.bgDark,
        borderBottom: "1px solid " + C.border,
        padding: "16px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FolioIcon size={26} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
              {org ? org.name : "Portfolio"}
              <PipMark size={6} color={C.accent} opacity={0.5} />
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Leadership · Read only
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: C.textSub }}>
            {userMeta ? userMeta.full_name || "" : ""}
          </div>
          <button
            onClick={onSignOut}
            style={{
              background: "none", border: "1px solid " + C.border, borderRadius: 8,
              padding: "6px 14px", fontSize: 12, color: C.textSub, cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 28px 48px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: C.textMuted, paddingTop: 80 }}>Loading portfolio…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Summary strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              {[
                { label: "Accounts",    value: accounts.length },
                { label: "Going Cold",  value: goingCold.length,  warn: goingCold.length > 0 },
                { label: "Open Tasks",  value: totalOpen,          warn: totalOpen > 10 },
                { label: "Team Size",   value: members.length },
              ].map(function (s) {
                return (
                  <div key={s.label} style={Object.assign({}, glass, { borderRadius: 10, padding: "14px 16px" })}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? C.yellow : C.text, fontVariantNumeric: "tabular-nums" }}>
                      {s.value}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

              {/* Left: Portfolio grid */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Portfolio</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[
                      { id: "status", label: "By Status" },
                      { id: "cold",   label: "By Cold"   },
                      { id: "items",  label: "By Items"  },
                    ].map(function (s) {
                      return (
                        <button
                          key={s.id}
                          onClick={function () { setSortBy(s.id); }}
                          style={{
                            background: sortBy === s.id ? C.bgPillActive : "transparent",
                            border: "1px solid " + (sortBy === s.id ? C.accentLine : C.border),
                            borderRadius: 6, padding: "4px 10px", fontSize: 11,
                            color: sortBy === s.id ? C.accent : C.textMuted,
                            cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif",
                          }}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {accounts.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.textMuted, padding: "40px 0", fontSize: 13 }}>
                    No accounts in this portfolio yet.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                    {sorted.map(function (account) {
                      return (
                        <AccountCard
                          key={account.id}
                          account={account}
                          openItemCount={itemCounts[account.id] || 0}
                          health={healthByAccount[account.id]}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Open items summary */}
                {topByItems.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                      Most Open Tasks
                    </div>
                    <Card>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {topByItems.map(function (a) {
                          return (
                            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: 13, color: C.text }}>{a.name}</div>
                              <div style={{
                                fontSize: 12, fontWeight: 700, color: C.yellow,
                                background: C.yellowFaint, borderRadius: 10, padding: "2px 8px",
                                fontVariantNumeric: "tabular-nums",
                              }}>
                                {itemCounts[a.id]}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                )}
              </div>

              {/* Right: Activity feed */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Recent Activity</div>
                {activity.length === 0 ? (
                  <Card>
                    <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "20px 0" }}>
                      No activity yet.
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {activity.map(function (ev, i) {
                        var who    = memberMap[ev.user_id] || "Someone";
                        var action = EVENT_LABELS[ev.event_type] || ev.event_type;
                        var acctName = ev.payload && ev.payload.account_name ? ev.payload.account_name : null;
                        return (
                          <div
                            key={ev.id}
                            style={{
                              padding: "10px 0",
                              borderBottom: i < activity.length - 1 ? "1px solid " + C.border : "none",
                            }}
                          >
                            <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
                              <span style={{ color: C.text, fontWeight: 600 }}>{who}</span>
                              {" "}{action}
                              {acctName && <span style={{ color: C.accent }}>{" · "}{acctName}</span>}
                            </div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                              {timeAgo(ev.created_at)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
