// Account CRUD smoke test. Logs in, opens the Accounts workspace, creates a
// uniquely-named account, and verifies it both renders and survives a reload
// (i.e. it actually persisted to Supabase, not just client state).

import { S } from "../selectors.js";
import { login } from "../adapter.js";

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

  // 4. Reload and re-check — confirms it persisted to Supabase, not just local state.
  // A cold reload has to restore the Supabase session AND refetch the full
  // account list before the new row renders, which can take several seconds on
  // a well-populated sandbox. So we wait for the logged-in marker, navigate to
  // Accounts, then POLL the DOM (up to ~12s) instead of a single flat wait —
  // a flat 2s read was racing the refetch and producing a false "vanished".
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(S.loggedIn).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  const navAgain = page.locator(S.navAccounts).first();
  if (await navAgain.isVisible().catch(() => false)) { await navAgain.click({ timeout: 4000 }).catch(() => {}); }
  await page.locator(S.searchInput).first().waitFor({ state: "visible", timeout: 6_000 }).catch(() => {});

  let persisted = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const htmlAfter = await page.content();
    if (htmlAfter.includes(testName)) { persisted = true; break; }
    await page.waitForTimeout(1000);
  }
  results.push({
    name: "account survives reload (persisted to DB)",
    passed: persisted,
    note: persisted ? "persisted" : "vanished on reload after 12s poll — write may not have reached Supabase",
  });

  return results;
}
