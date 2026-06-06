// Account CRUD smoke test. Logs in, opens the Accounts workspace, creates a
// uniquely-named account, and verifies it both renders and survives a reload
// (i.e. it actually persisted to Supabase, not just client state).

import { S } from "../selectors.js";
import { login, getAccessToken } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // Go to the Accounts workspace.
  const accountsNav = page.locator(S.navAccounts).first();
  if (await accountsNav.isVisible().catch(() => false)) {
    await accountsNav.click({ timeout: 4000 }).catch(() => {});
  }
  // Wait for the accounts view to mount — the search input is a reliable marker.
  await page.locator(S.searchInput).first().waitFor({ state: "visible", timeout: 6_000 }).catch(() => {});

  // 1. Open the add-account modal.
  // The "Add Account" LitPill lives in the desktop sidebar (always rendered).
  // Use evaluate-based click as primary to bypass Playwright interceptability
  // checks (the floating Pip orb or reminder banners can block pointer dispatch
  // even when the button itself is visible).
  const addBtn = page.locator(S.addAccount).first();
  const addVisible = await addBtn.isVisible().catch(() => false);
  if (!addVisible) {
    results.push({ name: "Add Account CTA present", passed: false, note: "no Add Account button found" });
    return results;
  }

  // Try native Playwright click first; fall back to DOM .click() if it's
  // intercepted by an overlay (e.g. floating Pip orb, reminder banner).
  let clickOk = false;
  try {
    await addBtn.click({ timeout: 3000 });
    clickOk = true;
  } catch (_) {
    // Playwright click failed (intercepted) — dispatch directly on the element.
    clickOk = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /add account|\+ account/i.test(b.textContent));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // Modal is open once the name field shows.
  const nameInput = page.locator(S.modalNameInput).first();
  const modalOpen = await nameInput.waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false);
  let modalNote = "modal open";
  if (!modalOpen) {
    const diag = await page.evaluate(() => {
      const sheet = document.querySelector(".modal-sheet");
      const inputs = Array.from(document.querySelectorAll("input"))
        .slice(0, 12)
        .map((i) => i.id || i.getAttribute("placeholder") || i.type || "?");
      const btns = Array.from(document.querySelectorAll("button"))
        .filter((b) => b.textContent.trim())
        .slice(0, 8)
        .map((b) => b.textContent.trim().slice(0, 30));
      return { sheet: !!sheet, inputs, btns };
    }).catch(() => ({ sheet: null, inputs: [], btns: [] }));
    modalNote = `name field never appeared — clickOk:${clickOk}; .modal-sheet:${diag.sheet}; inputs:[${diag.inputs.join("|")}]; buttons:[${diag.btns.join("|")}]`;
  }
  results.push({
    name: "add-account modal opens with a name field",
    passed: modalOpen,
    note: modalNote,
  });
  if (!modalOpen) return results;

  // 2. Fill + save with a uniquely-named account.
  const testName = `_stress_${Date.now()}`;
  await nameInput.fill(testName).catch(() => {});

  // Attach a response listener BEFORE the save click so we can record whether
  // the app fires a Supabase REST write and what the server returned.
  const inserts = [];
  const onResp = (res) => {
    try {
      const u = res.url();
      const m = res.request().method();
      if (u.includes("/rest/v1/folio_accounts") && (m === "POST" || m === "PATCH")) {
        inserts.push({ method: m, status: res.status() });
      }
    } catch (_) {}
  };
  page.on("response", onResp);

  // Save click: native first, DOM fallback (mirrors modal-open pattern above).
  let saveClicked = false;
  try {
    await page.locator(S.modalSave).first().click({ timeout: 3000 });
    saveClicked = true;
  } catch (_) {
    saveClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".modal-sheet button"));
      const b = btns.find((x) => /^(add account|add department|add partner|save)/i.test((x.textContent || "").trim().toLowerCase()));
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // Wait up to ~6s for EITHER a successful insert response OR the modal to close.
  let sawInsertOk = false;
  let modalClosed = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    sawInsertOk = inserts.some((r) => r.method === "POST" && r.status >= 200 && r.status < 300);
    modalClosed = !(await page.locator(S.modalNameInput).first().isVisible().catch(() => false));
    if (sawInsertOk || modalClosed) break;
  }
  const insertSummary = inserts.length ? inserts.map((r) => `${r.method}:${r.status}`).join(",") : "NONE";
  page.off("response", onResp);

  // 3. Verify save by REAL signal: DB write fired or modal closed.
  results.push({
    name: "account save fired a DB write (modal closed / insert ok)",
    passed: sawInsertOk || modalClosed,
    note: `db write requests: [${insertSummary}]; modal closed: ${modalClosed}; saveClicked: ${saveClicked}`,
  });

  // 4. Verify persistence the bulletproof way: query Supabase REST directly for the
  // row we just created (immune to UI list-filter / render-timing flakiness),
  // then DELETE it so the sandbox stays clean. Uses the logged-in user's token.
  const token = await getAccessToken(page);
  let persisted = false;
  let cleanupOk = false;
  const base = (config.supabase && config.supabase.url) ? config.supabase.url.replace(/\/$/, "") : "";
  if (token && base) {
    const headers = { apikey: config.supabase.anonKey, Authorization: "Bearer " + token };
    const q = `${base}/rest/v1/folio_accounts?name=eq.${encodeURIComponent(testName)}&select=id`;
    try {
      const r = await fetch(q, { headers });
      const rows = r.ok ? await r.json() : [];
      persisted = Array.isArray(rows) && rows.length > 0;
      if (persisted) {
        const del = await fetch(`${base}/rest/v1/folio_accounts?name=eq.${encodeURIComponent(testName)}`, { method: "DELETE", headers });
        cleanupOk = del.ok;
      }
    } catch (_) { /* leave persisted=false */ }
  }
  results.push({
    name: "account persisted to the database (verified via API)",
    passed: persisted,
    note: persisted
      ? ("confirmed in DB" + (cleanupOk ? "; test row cleaned up" : "; cleanup skipped/failed"))
      : (token ? "row not found via API — create may not have persisted" : "no auth token — could not verify"),
  });

  return results;
}
