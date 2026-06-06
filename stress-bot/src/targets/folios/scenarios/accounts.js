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
  await page.locator(S.modalSave).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 3. Verify it appears in the list.
  const html = await page.content();
  const appeared = html.includes(testName);
  results.push({
    name: "account appears in the list after save",
    passed: appeared,
    note: appeared ? "found in DOM" : "saved account not visible — write or realtime sync may be broken",
  });

  // 4. Reload and re-check — confirms it persisted to Supabase, not just local state.
  await page.reload({ waitUntil: "domcontentloaded" });
  const navAgain = page.locator(S.navAccounts).first();
  if (await navAgain.isVisible().catch(() => false)) { await navAgain.click({ timeout: 4000 }).catch(() => {}); }
  await page.waitForTimeout(2000);
  const htmlAfter = await page.content();
  const persisted = htmlAfter.includes(testName);
  results.push({
    name: "account survives reload (persisted to DB)",
    passed: persisted,
    note: persisted ? "persisted" : "vanished on reload — only saved client-side",
  });

  return results;
}
