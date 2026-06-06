// Data integrity: account deletion must not leave orphaned child rows.
//
// According to supabase/schema.sql, folio_tasks.account_id references folio_accounts
// with ON DELETE SET NULL — so deleting an account should null the task's account_id,
// not leave it pointing at a now-deleted id (true orphan) and not necessarily
// delete the task itself (though cascade would also be acceptable).
//
// This scenario runs almost entirely via the REST API (no UI clicks beyond login)
// for speed and reliability.

import { login, getAccessToken } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  const token = await getAccessToken(page);
  const base = (config.supabase && config.supabase.url) ? config.supabase.url.replace(/\/$/, "") : "";

  if (!token || !base) {
    results.push({
      name: "deleting an account leaves no dangling child rows",
      passed: false,
      skipped: true,
      note: "no auth token or Supabase URL — cannot run REST-based integrity check",
    });
    return results;
  }

  const headers = {
    apikey:        config.supabase.anonKey,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Prefer:        "return=representation",
  };

  const ts = Date.now();
  const accountName = `_stressint_${ts}`;
  const taskTitle   = `_stressinttask_${ts}`;

  let accountId = null;
  let taskId    = null;

  // ── Step 1: Create test account via REST ──
  try {
    const r = await fetch(`${base}/rest/v1/folio_accounts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name:    accountName,
        // user_id is required by RLS — pull from the token subject.
        user_id: await page.evaluate(() => {
          try {
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith("sb-") && k.includes("auth-token")) {
                const v = JSON.parse(localStorage.getItem(k) || "null");
                if (v && v.user && v.user.id) return v.user.id;
                if (v && v.currentSession && v.currentSession.user && v.currentSession.user.id) return v.currentSession.user.id;
              }
            }
          } catch (_) {}
          return null;
        }).catch(() => null),
      }),
    });
    const rows = r.ok ? await r.json() : [];
    accountId = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch (_) {}

  if (!accountId) {
    results.push({
      name: "deleting an account leaves no dangling child rows",
      passed: false,
      note: "could not create test account via REST — check RLS or network",
    });
    return results;
  }

  // ── Step 2: Create a task under that account via REST ──
  try {
    const r = await fetch(`${base}/rest/v1/folio_tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        account_id: accountId,
        title:      taskTitle,
        // user_id required by RLS
        user_id: await page.evaluate(() => {
          try {
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith("sb-") && k.includes("auth-token")) {
                const v = JSON.parse(localStorage.getItem(k) || "null");
                if (v && v.user && v.user.id) return v.user.id;
                if (v && v.currentSession && v.currentSession.user && v.currentSession.user.id) return v.currentSession.user.id;
              }
            }
          } catch (_) {}
          return null;
        }).catch(() => null),
      }),
    });
    const rows = r.ok ? await r.json() : [];
    taskId = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch (_) {}

  if (!taskId) {
    // Clean up the account before bailing.
    await fetch(`${base}/rest/v1/folio_accounts?id=eq.${accountId}`, { method: "DELETE", headers }).catch(() => {});
    results.push({
      name: "deleting an account leaves no dangling child rows",
      passed: false,
      note: "could not create test task via REST — check RLS or folio_tasks schema",
    });
    return results;
  }

  // ── Step 3: DELETE the account ──
  const delHeaders = { apikey: headers.apikey, Authorization: headers.Authorization };
  try {
    await fetch(`${base}/rest/v1/folio_accounts?id=eq.${accountId}`, {
      method: "DELETE",
      headers: delHeaders,
    });
  } catch (_) {}

  // ── Step 4: Inspect the task row ──
  let taskRow = null;
  try {
    const r = await fetch(`${base}/rest/v1/folio_tasks?id=eq.${taskId}&select=id,account_id`, { headers: delHeaders });
    const rows = r.ok ? await r.json() : null;
    taskRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (_) {}

  let passed = false;
  let note = "";
  if (taskRow === null) {
    // Task was cascade-deleted — also acceptable (no orphan possible).
    passed = true;
    note = "task was cascade-deleted along with the account — no orphan possible";
  } else if (taskRow.account_id === null) {
    // account_id set to NULL — correct ON DELETE SET NULL behavior.
    passed = true;
    note = "task row survived with account_id=null (ON DELETE SET NULL confirmed)";
  } else {
    // Task still points at the deleted account id — true orphan.
    passed = false;
    note = `ORPHAN DETECTED: task still has account_id=${taskRow.account_id} which points at a deleted account`;
  }

  results.push({
    name: "deleting an account leaves no dangling child rows",
    passed,
    note,
  });

  // ── Cleanup: delete the task row if it still exists ──
  if (taskRow !== null) {
    await fetch(`${base}/rest/v1/folio_tasks?id=eq.${taskId}`, {
      method: "DELETE",
      headers: delHeaders,
    }).catch(() => {});
  }

  return results;
}
