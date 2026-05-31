// Pip Tier A — daily account state snapshot computation.
// Called once per day from App.jsx on auth load.
// Uses computeAccountHealth + gatherSignals from accountHealth.js to derive scores.
// Reads data it needs directly from Supabase (not through hooks) so it
// can run as a fire-and-forget side-effect at the app level.

import { supabase } from "./supabase";
import { computeAccountHealth, gatherSignals } from "./accountHealth";

var STORAGE_KEY_PREFIX = "folio_snapshots_computed_";

function todayKey() {
  return STORAGE_KEY_PREFIX + new Date().toISOString().slice(0, 10);
}

export function snapshotsComputedToday() {
  return !!localStorage.getItem(todayKey());
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

// Derive a numeric health score from the status (0-100, higher = healthier).
function healthScore(status) {
  if (status === "green")  return 90;
  if (status === "new")    return 80;
  if (status === "yellow") return 50;
  if (status === "red")    return 20;
  return 70;
}

// Main entry point. Called from App.jsx after auth resolves.
// No-ops if already computed today.
export async function computeAndSaveSnapshots(userId) {
  if (!userId) return;
  if (snapshotsComputedToday()) return;

  try {
    // Fetch everything we need in parallel
    var [accR, itemR, projR] = await Promise.all([
      supabase.from("folio_accounts").select("*").eq("user_id", userId).eq("is_inactive", false),
      supabase.from("folio_tasks").select("id, account_id, done, due_date").eq("user_id", userId).is("project_id", null),
      supabase.from("gauge_projects").select("id, account_id, status, stages").eq("user_id", userId),
    ]);

    if (accR.error || !accR.data) return;

    var accounts  = accR.data  || [];
    var items     = itemR.data || [];
    var projects  = projR.data || [];
    var today     = new Date().toISOString().slice(0, 10);
    var now       = Date.now();
    var sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();

    var rows = accounts.map(function (account) {
      var acctItems    = items.filter(function (i)    { return i.account_id === account.id; });
      var acctProjects = projects.filter(function (p) { return p.account_id === account.id; });

      // Use gatherSignals + computeAccountHealth for consistency with AccountsView
      var signals = gatherSignals(account, items, projects, today);
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
        var stages = p.stages || [];
        var hasRecentProgress = stages.some(function (s) {
          return s.done && s.done_at && s.done_at > sevenDaysAgo;
        });
        return !hasRecentProgress;
      });

      return {
        user_id: userId,
        account_id: account.id,
        snapshot_date: today,
        health_status: mapHealthStatus(health.status),
        health_score: healthScore(health.status),
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

    localStorage.setItem(todayKey(), "1");
  } catch (e) {
    // Fire-and-forget — never block the app
    console.warn("[accountSnapshots] compute failed:", e);
  }
}
