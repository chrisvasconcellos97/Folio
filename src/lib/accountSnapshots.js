// Pip Tier A — daily account state snapshot computation.
// Called once per day from App.jsx on auth load.
// Uses computeAccountHealth + gatherSignals from accountHealth.js to derive scores.
// Reads data it needs directly from Supabase (not through hooks) so it
// can run as a fire-and-forget side-effect at the app level.

import { supabase } from "./supabase";
import { computeAccountHealth, gatherSignals } from "./accountHealth";
import { projectMatchesAccount } from "./gaugeStatus";
import { attachTasksToProjects } from "./projectTasks";

var STORAGE_KEY_PREFIX = "folio_snapshots_computed_";

function etToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function todayKey(userId) {
  return STORAGE_KEY_PREFIX + (userId ? userId + "_" : "") + etToday();
}

export function snapshotsComputedToday(userId) {
  return !!localStorage.getItem(todayKey(userId));
}

// Map health status values to the canonical tokens used in snapshots.
// accountHealth.js returns 'green' | 'yellow' | 'red' | 'new'.
// Snapshots use 'healthy' | 'watching' | 'at_risk' | 'new'.
function mapHealthStatus(status) {
  if (status === "green")  return "healthy";
  if (status === "yellow") return "watching";
  if (status === "red")    return "at_risk";
  return status || "healthy";
}

// Derive a real weighted health score (0-100) from signals + days cold.
// Uses actual signal counts so the sparkline moves meaningfully over time.
function weightedHealthScore(signals, daysCold, tier) {
  if (signals.accountAgeDays < 7) return 85;
  var TH = {
    Major:  { redCold: 30, yelCold: 14 },
    Mid:    { redCold: 45, yelCold: 21 },
    Growth: { redCold: 60, yelCold: 30 },
  };
  var th = TH[tier] || TH.Growth;
  var score = 100;
  if (daysCold !== null) {
    if (daysCold > th.redCold)       score -= 40 + Math.min((daysCold - th.redCold) * 0.5, 20);
    else if (daysCold > th.yelCold)  score -= 15 + Math.min((daysCold - th.yelCold) * 0.4, 15);
    else                             score -= daysCold * 0.3;
  }
  score -= signals.openItemsOverdue * 8;
  score -= signals.blockedProjects  * 20;
  score -= signals.onHoldProjects   * 5;
  score -= signals.missedCadences   * 12;
  return Math.max(5, Math.min(100, Math.round(score)));
}

// Main entry point. Called from App.jsx after auth resolves.
// No-ops if already computed today.
export async function computeAndSaveSnapshots(userId) {
  if (!userId) return;
  if (snapshotsComputedToday(userId)) return;

  try {
    // Fetch everything we need in parallel.
    // Meetings capped at 300 — gatherSignals only needs recency signals;
    // the global useMeetings hook caps at the same value.
    var [accR, itemR, projR, projTaskR, cadR, meetR] = await Promise.all([
      supabase.from("folio_accounts").select("*").eq("user_id", userId).eq("is_inactive", false),
      supabase.from("folio_tasks").select("id, account_id, done, due_date").eq("user_id", userId).is("project_id", null).limit(500),
      supabase.from("gauge_projects").select("id, account_id, account_ids, status").eq("user_id", userId).limit(500),
      // Project work lives in folio_tasks now (task-model unification) — fetch
      // it to hydrate project.tasks for the stuck-detection check below.
      supabase.from("folio_tasks").select("id, project_id, done, closed_at, updated_at, sort_order, created_at").eq("user_id", userId).not("project_id", "is", null).limit(2000),
      supabase.from("folio_cadences").select("id, account_id, frequency, created_at").eq("user_id", userId).limit(200),
      supabase.from("folio_meetings").select("id, cadence_id, meeting_date, created_at, status").eq("user_id", userId).order("meeting_date", { ascending: false }).limit(300),
    ]);

    if (accR.error || !accR.data) return;

    var accounts  = accR.data  || [];
    var items     = itemR.data || [];
    var projects  = attachTasksToProjects(projR.data || [], projTaskR.data || []);
    var cadences  = cadR.data  || [];
    var meetings  = meetR.data || [];
    var today     = etToday();
    var now       = Date.now();
    var sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();

    var rows = accounts.map(function (account) {
      var acctItems    = items.filter(function (i)    { return i.account_id === account.id; });
      var acctProjects = projects.filter(function (p) { return projectMatchesAccount(p, account.id); });

      // Use gatherSignals + computeAccountHealth for consistency with AccountsView
      var signals = gatherSignals(account, items, projects, today, cadences, meetings);
      var health  = computeAccountHealth(account, signals);

      // Days since last contact
      var lastContactMs = account.last_interaction_at
        ? new Date(account.last_interaction_at).getTime()
        : null;
      var daysSince = lastContactMs ? Math.floor((now - lastContactMs) / 86400000) : null;

      var openItems    = acctItems.filter(function (i) { return !i.done; });
      var overdueItems = openItems.filter(function (i) {
        return i.due_date && i.due_date < today;
      });

      var activeProjects = acctProjects.filter(function (p) {
        return p.status === "in_progress" || p.status === "planned";
      });

      // Stuck = in_progress project where no stage completed in last 7 days
      var stuckProjects = acctProjects.filter(function (p) {
        if (p.status !== "in_progress") return false;
        var stages = p.tasks || [];
        var hasRecentProgress = stages.some(function (s) {
          return s.completed_at && s.completed_at > sevenDaysAgo;
        });
        return !hasRecentProgress;
      });

      return {
        user_id: userId,
        account_id: account.id,
        snapshot_date: today,
        health_status: mapHealthStatus(health.status),
        health_score: weightedHealthScore(signals, daysSince, account.tier || "Growth"),
        days_since_contact: daysSince,
        open_item_count: openItems.length,
        overdue_item_count: overdueItems.length,
        active_project_count: activeProjects.length,
        stuck_project_count: stuckProjects.length,
        pip_tone: account.pip_tone || null,
      };
    });

    if (rows.length === 0) return;

    await supabase
      .from("folio_account_snapshots")
      .upsert(rows, { onConflict: "user_id,account_id,snapshot_date" });

    localStorage.setItem(todayKey(userId), "1");
  } catch (e) {
    // Fire-and-forget — never block the app
    console.warn("[accountSnapshots] compute failed:", e);
  }
}
