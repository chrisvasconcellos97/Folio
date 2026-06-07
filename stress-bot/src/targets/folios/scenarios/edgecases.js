// edgecases.js — hostile inputs a real user would never create.
//
// Each sub-check is independent: a setup failure in one does NOT fail the
// others. If a REST insert is rejected, that sub-check emits skipped:true
// with a diagnostic; the other sub-checks still run.
//
// (a) SELF-REFERENCING PARENT:  PATCH an account's parent_account_id to its
//     own id. Then drive the UI accounts list and confirm no ErrorBoundary
//     appeared and the page is still responsive. Guards against infinite
//     recursion in the account-tree builder.
//
// (b) DUPLICATE NAMES: create two accounts with the same name via REST.
//     Navigate to Accounts and confirm no crash + both rows exist.
//
// (c) FAR-FUTURE / PAST DATES: create meetings with meeting_date '1900-01-01'
//     and '2999-12-31'. Navigate to the account's detail view and confirm
//     no crash.

import { login, getAccessToken } from "../adapter.js";
import { S } from "../selectors.js";

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

// Returns true if an ErrorBoundary "Reload" alert is visible on the page.
async function errorBoundaryVisible(page) {
  return page.locator('[role="alert"]:has-text("Reload")').first().isVisible().catch(() => false);
}

export async function run({ page, config }) {
  const results = [];

  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  const token = await getAccessToken(page);
  const base  = config.supabase && config.supabase.url
    ? config.supabase.url.replace(/\/$/, "")
    : "";

  // All three sub-checks need REST access; skip all if setup is unavailable.
  if (!token || !base) {
    for (const name of [
      "self-referencing sub-account does not crash the list",
      "duplicate-named accounts don't break the list",
      "extreme meeting dates don't crash the calendar/view",
    ]) {
      results.push({ name, passed: true, skipped: true, note: "no auth token or Supabase URL" });
    }
    return results;
  }

  const uid = await getUserId(page);
  if (!uid) {
    for (const name of [
      "self-referencing sub-account does not crash the list",
      "duplicate-named accounts don't break the list",
      "extreme meeting dates don't crash the calendar/view",
    ]) {
      results.push({ name, passed: true, skipped: true, note: "could not extract user id from session" });
    }
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

  // ──────────────────────────────────────────────────────────────────────────
  // (a) SELF-REFERENCING PARENT
  // ──────────────────────────────────────────────────────────────────────────
  {
    const name = "self-referencing sub-account does not crash the list";
    let selfId = null;
    let skipped = false;
    let skipNote = "";

    try {
      // Create the account
      const r = await fetch(`${base}/rest/v1/folio_accounts`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name:          `_stressself_${ts}`,
          user_id:       uid,
          owner_user_id: uid,
          account_type:  "standard",
        }),
      });
      const rows = r.ok ? await r.json() : [];
      selfId = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
    } catch (_) {}

    if (!selfId) {
      results.push({ name, passed: true, skipped: true, note: "could not create test account — skipping sub-check (a)" });
    } else {
      // PATCH it to point at itself — DB may reject this with a FK check constraint
      // (postgres won't usually — there's no explicit self-ref prohibition unless
      // a trigger exists); if the PATCH is rejected, emit skipped.
      let patchOk = false;
      let patchNote = "";
      try {
        // Supabase PostgREST PATCH needs a filter
        const r = await fetch(`${base}/rest/v1/folio_accounts?id=eq.${selfId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ parent_account_id: selfId }),
        });
        patchOk = r.ok;
        if (!r.ok) {
          let body = null;
          try { body = await r.json(); } catch (_) {}
          patchNote = `PATCH rejected HTTP ${r.status}: ${body ? JSON.stringify(body).slice(0, 200) : ""}`;
        }
      } catch (err) {
        patchNote = String(err && err.message ? err.message : err).slice(0, 200);
      }

      if (!patchOk) {
        // DB refused the self-ref — that's fine (even better than allowing it)
        results.push({
          name,
          passed: true,
          skipped: true,
          note: `DB rejected self-referencing parent_account_id (not an app failure). ${patchNote}`,
        });
      } else {
        // Self-ref was accepted — now drive the Accounts UI and check for crash
        try {
          // Navigate to Accounts
          const acctNav = page.locator(S.navAccounts).first();
          if (await acctNav.isVisible().catch(() => false)) {
            await acctNav.click({ timeout: 4000 }).catch(() => {});
          }
          // Wait for account list to render (search input is a reliable marker)
          await page.locator(S.searchInput).first()
            .waitFor({ state: "visible", timeout: 8_000 })
            .catch(() => {});

          // Allow any React rendering to settle
          await page.waitForTimeout(1500);

          const crashed     = await errorBoundaryVisible(page);
          const searchVisible = await page.locator(S.searchInput).first().isVisible().catch(() => false);
          const passed      = !crashed && searchVisible;
          results.push({
            name,
            passed,
            note: passed
              ? "accounts list rendered normally with self-referencing account present"
              : `FAIL — crashed=${crashed}; searchVisible=${searchVisible}`,
          });
        } catch (err) {
          results.push({ name, passed: false, note: "UI check threw: " + String(err && err.message ? err.message : err).slice(0, 200) });
        }
      }

      // Cleanup
      await fetch(`${base}/rest/v1/folio_accounts?id=eq.${selfId}`, { method: "DELETE", headers: delHeaders }).catch(() => {});
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // (b) DUPLICATE NAMES
  // ──────────────────────────────────────────────────────────────────────────
  {
    const name = "duplicate-named accounts don't break the list";
    const dupName = `_stressdup_${ts}`;
    let dup1 = null;
    let dup2 = null;

    try {
      const r1 = await fetch(`${base}/rest/v1/folio_accounts`, {
        method: "POST", headers,
        body: JSON.stringify({ name: dupName, user_id: uid, owner_user_id: uid, account_type: "standard" }),
      });
      const rows1 = r1.ok ? await r1.json() : [];
      dup1 = Array.isArray(rows1) && rows1.length > 0 ? rows1[0].id : null;
    } catch (_) {}

    try {
      const r2 = await fetch(`${base}/rest/v1/folio_accounts`, {
        method: "POST", headers,
        body: JSON.stringify({ name: dupName, user_id: uid, owner_user_id: uid, account_type: "standard" }),
      });
      const rows2 = r2.ok ? await r2.json() : [];
      dup2 = Array.isArray(rows2) && rows2.length > 0 ? rows2[0].id : null;
    } catch (_) {}

    if (!dup1 || !dup2) {
      results.push({
        name,
        passed: true,
        skipped: true,
        note: `could not create both duplicate accounts (dup1=${dup1}, dup2=${dup2}) — DB may enforce unique names. Skipping sub-check (b).`,
      });
      // Best-effort cleanup
      if (dup1) await fetch(`${base}/rest/v1/folio_accounts?id=eq.${dup1}`, { method: "DELETE", headers: delHeaders }).catch(() => {});
    } else {
      // Verify both exist in DB
      let count = 0;
      try {
        const r = await fetch(
          `${base}/rest/v1/folio_accounts?name=eq.${encodeURIComponent(dupName)}&select=id`,
          { headers: Object.assign({}, delHeaders, { Prefer: "count=exact" }) }
        );
        const rows = r.ok ? await r.json() : [];
        count = Array.isArray(rows) ? rows.length : 0;
      } catch (_) {}

      // Drive UI
      let uiCrashed = false;
      let uiResponsive = false;
      try {
        const acctNav = page.locator(S.navAccounts).first();
        if (await acctNav.isVisible().catch(() => false)) {
          await acctNav.click({ timeout: 4000 }).catch(() => {});
        }
        await page.locator(S.searchInput).first()
          .waitFor({ state: "visible", timeout: 8_000 })
          .catch(() => {});
        await page.waitForTimeout(1000);
        uiCrashed    = await errorBoundaryVisible(page);
        uiResponsive = await page.locator(S.searchInput).first().isVisible().catch(() => false);
      } catch (_) {}

      const passed = !uiCrashed && uiResponsive && count >= 2;
      results.push({
        name,
        passed,
        note: passed
          ? `both duplicate-named accounts exist (count=${count}) and accounts list is stable`
          : `FAIL — dbCount=${count}; uiCrashed=${uiCrashed}; uiResponsive=${uiResponsive}`,
      });

      // Cleanup
      await fetch(`${base}/rest/v1/folio_accounts?id=eq.${dup1}`, { method: "DELETE", headers: delHeaders }).catch(() => {});
      await fetch(`${base}/rest/v1/folio_accounts?id=eq.${dup2}`, { method: "DELETE", headers: delHeaders }).catch(() => {});
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // (c) FAR-FUTURE / PAST DATES
  // ──────────────────────────────────────────────────────────────────────────
  {
    const name = "extreme meeting dates don't crash the calendar/view";
    let tempAcctId = null;
    let meetingPast   = null;
    let meetingFuture = null;

    // Create a temp account to hang the meetings on
    try {
      const r = await fetch(`${base}/rest/v1/folio_accounts`, {
        method: "POST", headers,
        body: JSON.stringify({ name: `_stressdate_${ts}`, user_id: uid, owner_user_id: uid, account_type: "standard" }),
      });
      const rows = r.ok ? await r.json() : [];
      tempAcctId = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
    } catch (_) {}

    if (!tempAcctId) {
      results.push({
        name,
        passed: true,
        skipped: true,
        note: "could not create temp account for date-edge meetings — skipping sub-check (c)",
      });
    } else {
      // Create meetings with extreme dates
      // method must be null or one of the allowed values; status must be 'draft'|'summarized'
      const meetingBase = { account_id: tempAcctId, user_id: uid, status: "draft" };

      try {
        const r = await fetch(`${base}/rest/v1/folio_meetings`, {
          method: "POST", headers,
          body: JSON.stringify(Object.assign({}, meetingBase, {
            title: `_stressdate_past_${ts}`,
            meeting_date: "1900-01-01",
          })),
        });
        const rows = r.ok ? await r.json() : [];
        meetingPast = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
      } catch (_) {}

      try {
        const r = await fetch(`${base}/rest/v1/folio_meetings`, {
          method: "POST", headers,
          body: JSON.stringify(Object.assign({}, meetingBase, {
            title: `_stressdate_future_${ts}`,
            meeting_date: "2999-12-31",
          })),
        });
        const rows = r.ok ? await r.json() : [];
        meetingFuture = Array.isArray(rows) && rows.length > 0 ? rows[0].id : null;
      } catch (_) {}

      if (!meetingPast && !meetingFuture) {
        results.push({
          name,
          passed: true,
          skipped: true,
          note: "DB rejected both extreme-date meetings — skipping UI check for sub-check (c)",
        });
      } else {
        // Navigate to the Accounts list then click into this account's meetings/calendar view.
        // A crash is evidenced by ErrorBoundary or the accounts list becoming unresponsive.
        let uiCrashed    = false;
        let uiResponsive = false;
        try {
          // Go to Accounts and look for our account
          const acctNav = page.locator(S.navAccounts).first();
          if (await acctNav.isVisible().catch(() => false)) {
            await acctNav.click({ timeout: 4000 }).catch(() => {});
          }
          await page.locator(S.searchInput).first()
            .waitFor({ state: "visible", timeout: 8_000 })
            .catch(() => {});

          // Navigate to Calendar view (may or may not show our temp account)
          // Any crash anywhere on the page counts
          const calNav = page.locator('button:has-text("Calendar")').first();
          if (await calNav.isVisible().catch(() => false)) {
            await calNav.click({ timeout: 4000 }).catch(() => {});
            await page.waitForTimeout(1500);
          }

          uiCrashed    = await errorBoundaryVisible(page);
          // The page is responsive if at least one nav button is still visible
          uiResponsive = await page.locator(S.navAccounts).first().isVisible().catch(() => false);
        } catch (_) {}

        const passed = !uiCrashed && uiResponsive;
        const created = [meetingPast && "1900-01-01", meetingFuture && "2999-12-31"].filter(Boolean);
        results.push({
          name,
          passed,
          note: passed
            ? `extreme-date meetings (${created.join(", ")}) inserted; Calendar view stable`
            : `FAIL — uiCrashed=${uiCrashed}; uiResponsive=${uiResponsive}; datesCreated=${created.join(", ")}`,
        });
      }

      // Cleanup: meetings first (FK), then account
      if (meetingPast)   await fetch(`${base}/rest/v1/folio_meetings?id=eq.${meetingPast}`,   { method: "DELETE", headers: delHeaders }).catch(() => {});
      if (meetingFuture) await fetch(`${base}/rest/v1/folio_meetings?id=eq.${meetingFuture}`, { method: "DELETE", headers: delHeaders }).catch(() => {});
      await fetch(`${base}/rest/v1/folio_accounts?id=eq.${tempAcctId}`, { method: "DELETE", headers: delHeaders }).catch(() => {});
    }
  }

  return results;
}
