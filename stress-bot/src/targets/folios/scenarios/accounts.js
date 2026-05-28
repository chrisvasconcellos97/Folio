// Account CRUD smoke test — assumes already logged in.

import { S } from "../selectors.js";
import { login } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // 1. Open the add-account modal.
  const addBtn = await page.$(S.addAccount).catch(() => null);
  if (!addBtn) {
    results.push({ name: "add account button present", passed: false, note: "no add-account button found" });
    return results;
  }
  await addBtn.click().catch(() => {});
  await page.waitForTimeout(500);

  const nameInput = await page.$(S.modalNameInput).catch(() => null);
  results.push({
    name: "add account modal opens with name input",
    passed: !!nameInput,
    note: nameInput ? "modal open" : "modal did not surface a name input",
  });
  if (!nameInput) return results;

  // 2. Fill + save with a uniquely-named account.
  const testName = `_stress_${Date.now()}`;
  await nameInput.fill(testName).catch(() => {});
  await page.click(S.modalSave).catch(() => {});
  await page.waitForTimeout(1200);

  // 3. Verify it appears in the list.
  const html = await page.content();
  results.push({
    name: "account appears in list after save",
    passed: html.includes(testName),
    note: html.includes(testName) ? "found in DOM" : "saved account not visible — write or sync broken",
  });

  // 4. Refresh and re-check — confirms it persisted to Supabase, not just local state.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const htmlAfter = await page.content();
  results.push({
    name: "account survives reload (persisted to DB)",
    passed: htmlAfter.includes(testName),
    note: htmlAfter.includes(testName) ? "persisted" : "vanished on reload — only saved client-side",
  });

  return results;
}
