// Account CRUD smoke test. Logs in, opens the Accounts workspace, creates a
// uniquely-named account, and verifies it both renders and survives a reload
// (i.e. it actually persisted to Supabase, not just client state).

import { S } from "../selectors.js";
import { login } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // Go to the Accounts workspace — the "Add Account" CTA lives there, not on Home.
  const accountsNav = page.locator(S.navAccounts).first();
  if (await accountsNav.isVisible().catch(() => false)) {
    await accountsNav.click().catch(() => {});
    await page.waitForTimeout(600);
  }

  // 1. Open the add-account modal (the sidebar/header CTA).
  const addBtn = page.locator(S.addAccount).first();
  if (!(await addBtn.isVisible().catch(() => false))) {
    results.push({ name: "add-account button present", passed: false, note: "no Add Account CTA on the Accounts view" });
    return results;
  }
  await addBtn.click().catch(() => {});

  // Modal is open once the name field shows.
  const nameInput = page.locator(S.modalNameInput).first();
  const modalOpen = await nameInput.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
  results.push({
    name: "add-account modal opens with a name field",
    passed: modalOpen,
    note: modalOpen ? "modal open" : "name field never appeared",
  });
  if (!modalOpen) return results;

  // 2. Fill + save with a uniquely-named account.
  const testName = `_stress_${Date.now()}`;
  await nameInput.fill(testName).catch(() => {});
  await page.locator(S.modalSave).first().click().catch(() => {});
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
  // Make sure we're back on the Accounts view, then give realtime a beat.
  const navAgain = page.locator(S.navAccounts).first();
  if (await navAgain.isVisible().catch(() => false)) { await navAgain.click().catch(() => {}); }
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
