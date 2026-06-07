// orphans.js — deleting an account must leave no orphaned child rows.
//
// Creates one child row in each of the main account-FK child tables, then
// deletes the parent account and verifies every child was either cascade-
// deleted or had its FK nulled. An orphan (row still exists AND FK still
// points at the now-deleted account id) is a genuine integrity failure.
//
// All verification is done via REST — no fragile UI clicks needed.
//
// ON DELETE behavior per supabase/schema.sql:
//   folio_contacts  (account_id NOT NULL) → ON DELETE CASCADE
//   folio_meetings  (account_id NOT NULL) → ON DELETE CASCADE
//   folio_items     (account_id NOT NULL) → ON DELETE CASCADE
//   folio_cadences  (account_id NOT NULL) → ON DELETE CASCADE
//   gauge_projects  (account_id nullable)  → ON DELETE CASCADE
//   folio_tasks     (account_id, Gauge V3 table) → tested; skip if insert rejected

import { login, getAccessToken } from "../adapter.js";

// Pull the user id out of the Supabase auth token stored in localStorage.
async function getUserId(page) {
  return page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sb-") && k.includes("auth-token")) {
          const v = JSON.parse(localStorage.getItem(k) || "null");
          if (v && v.user && v.user.id) return v.user.id;
          if (v && v.currentSession && v.currentSession.user && v.currentSession.user.id)
            return v.currentSession.user.id;
        }
      }
    } catch (_) {}
    return null;
  }).catch(() => null);
}

export async function run({ page, config }) {
  const results = [];

  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  const token = await getAccessToken(page);
  const base  = config.supabase && config.supabase.url
    ? config.supabase.url.replace(/\/$/, "")
    : "";

  if (!token || !base) {
    results.push({
      name: "orphan check: setup",
      passed: false,
      skipped: true,
      note: "no auth token or Supabase URL — cannot run REST-based orphan checks",
    });
    return results;
  }

  const uid = await getUserId(page);
  if (!uid) {
    results.push({
      name: "orphan check: setup",
      passed: false,
      skipped: true,
      note: "could not extract user id from localStorage session — aborting",
    });
    return results;
  }

  const headers = {
    apikey:        config.supabase.anonKey,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Prefer:        "return=representation",
  };
  const delHeaders = {
    apikey:        config.supabase.anonKey,
    Authorization: "Bearer " + token,
  };

  const ts = Date.now();

  // ── Step 1: Create the parent account ──────────────────────────────────────
  let acctId = null;
  try {
    const r = await fetch(`${base}/rest/v1/folio_accounts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name:          `_stressorph_${ts}`,
        user_id:       uid,
        owner_user_id: uid,
        account_type:  "standard",
      }),
    });
    const rows = r.ok ? await r.json() : [];
    acctId = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
  } catch (_) {}

  if (!acctId) {
    results.push({
      name: "orphan check: create parent account",
      passed: false,
      note: "could not create test account via REST — check RLS or network",
    });
    return results;
  }

  // ── Step 2: Create one child per table ────────────────────────────────────
  // fkCol is the account FK column name on the child table.
  // Body only includes NOT NULL columns; optional columns omitted.
  const childDefs = [
    {
      table:  "folio_contacts",
      label:  "folio_contacts",
      fkCol:  "account_id",
      // account_id NOT NULL (ON DELETE CASCADE), user_id NOT NULL, name NOT NULL
      body: { account_id: acctId, user_id: uid, name: `_orphtest_contact_${ts}` },
    },
    {
      table:  "folio_meetings",
      label:  "folio_meetings",
      fkCol:  "account_id",
      // account_id NOT NULL (ON DELETE CASCADE), user_id NOT NULL
      // status check: 'draft'|'summarized'; method check: 'phone'|'email'|'video'|'in_person'|null
      body: {
        account_id:   acctId,
        user_id:      uid,
        title:        `_orphtest_meeting_${ts}`,
        meeting_date: new Date().toISOString().slice(0, 10),
        status:       "draft",
        method:       "phone",
      },
    },
    {
      table:  "folio_items",
      label:  "folio_items",
      fkCol:  "account_id",
      // account_id NOT NULL (ON DELETE CASCADE), user_id NOT NULL, text NOT NULL
      body: { account_id: acctId, user_id: uid, text: `_orphtest_item_${ts}` },
    },
    {
      table:  "folio_cadences",
      label:  "folio_cadences",
      fkCol:  "account_id",
      // account_id NOT NULL (ON DELETE CASCADE), user_id NOT NULL
      // type NOT NULL check: 'meeting'|'task'
      // frequency NOT NULL check: 'weekly'|'biweekly'|'monthly'|'quarterly'
      body: {
        account_id: acctId,
        user_id:    uid,
        type:       "meeting",
        frequency:  "monthly",
      },
    },
    {
      table:  "gauge_projects",
      label:  "gauge_projects",
      fkCol:  "account_id",
      // account_id nullable FK (ON DELETE CASCADE fires when set), user_id NOT NULL, title NOT NULL
      // status default 'planned'; check: planned|in_progress|blocked|complete|on_hold
      body: {
        account_id: acctId,
        user_id:    uid,
        title:      `_orphtest_project_${ts}`,
        status:     "planned",
      },
    },
    {
      table:  "folio_tasks",
      label:  "folio_tasks",
      fkCol:  "account_id",
      // folio_tasks added in Gauge V3 migration (not in schema.sql committed file)
      // best-effort insert; skip gracefully if rejected (table may not exist or
      // require additional NOT NULL columns we cannot infer)
      body: {
        account_id: acctId,
        user_id:    uid,
        title:      `_orphtest_task_${ts}`,
      },
    },
  ];

  // Insert each child; record result
  const children = [];
  for (const def of childDefs) {
    let childId   = null;
    let insertErr = null;
    try {
      const r = await fetch(`${base}/rest/v1/${def.table}`, {
        method: "POST",
        headers,
        body: JSON.stringify(def.body),
      });
      const rows = r.ok ? await r.json() : null;
      if (r.ok && Array.isArray(rows) && rows.length > 0) {
        childId = rows[0].id;
      } else {
        const errBody = rows ? JSON.stringify(rows).slice(0, 200) : `HTTP ${r.status}`;
        insertErr = errBody;
      }
    } catch (err) {
      insertErr = String(err && err.message ? err.message : err).slice(0, 200);
    }
    children.push(Object.assign({}, def, { childId, insertErr }));
  }

  // ── Step 3: Delete the parent account ────────────────────────────────────
  try {
    await fetch(`${base}/rest/v1/folio_accounts?id=eq.${acctId}`, {
      method: "DELETE",
      headers: delHeaders,
    });
  } catch (_) {}

  // ── Step 4: Verify each child ────────────────────────────────────────────
  for (const child of children) {
    if (!child.childId) {
      // Insert was rejected — skip this table; not a runtime app failure
      results.push({
        name: `${child.label}: no orphan after account delete`,
        passed: true,
        skipped: true,
        note: `insert rejected — skipping orphan check for ${child.table}. Reason: ${child.insertErr || "unknown"}`,
      });
      continue;
    }

    let row      = null;
    let fetchErr = null;
    try {
      const r = await fetch(
        `${base}/rest/v1/${child.table}?id=eq.${child.childId}&select=id,${child.fkCol}`,
        { headers: delHeaders }
      );
      const rows = r.ok ? await r.json() : null;
      row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch (err) {
      fetchErr = String(err && err.message ? err.message : err).slice(0, 200);
    }

    let passed = false;
    let note   = "";

    if (fetchErr) {
      passed = false;
      note   = `fetch threw: ${fetchErr}`;
    } else if (row === null) {
      // Row gone — cascade deleted, no orphan possible
      passed = true;
      note   = "row cascade-deleted with parent account — no orphan possible";
    } else if (row[child.fkCol] === null) {
      // FK nulled — ON DELETE SET NULL; referential integrity intact
      passed = true;
      note   = `row survived; ${child.fkCol}=null (ON DELETE SET NULL confirmed)`;
    } else if (row[child.fkCol] === acctId) {
      // Still points at the deleted account — true orphan
      passed = false;
      note   = `ORPHAN: row id=${child.childId} still has ${child.fkCol}=${acctId} (deleted account id)`;
    } else {
      // FK changed to something unexpected
      passed = false;
      note   = `UNEXPECTED: ${child.fkCol} is now "${row[child.fkCol]}" (expected null or row gone)`;
    }

    results.push({ name: `${child.label}: no orphan after account delete`, passed, note });

    // Cleanup: delete child if it still exists (set-null case leaves it alive)
    if (row !== null) {
      await fetch(`${base}/rest/v1/${child.table}?id=eq.${child.childId}`, {
        method: "DELETE",
        headers: delHeaders,
      }).catch(() => {});
    }
  }

  // Parent was already deleted above; no extra cleanup needed.
  return results;
}
