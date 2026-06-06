// Contact creation smoke test.
//
// Logs in, opens the first real account, navigates to the Contacts tab,
// adds a uniquely-named contact via the AddContactModal, and verifies
// the row persisted to the DB via the Supabase REST API.
//
// Pattern mirrors accounts.js: native-then-DOM-fallback clicks, REST verify + DELETE cleanup.

import { S } from "../selectors.js";
import { login, getAccessToken } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // ── Navigate to Accounts ──
  await page.locator(S.navAccounts).first().click({ timeout: 4000 }).catch(() => {});
  await page.locator(S.searchInput).first().waitFor({ state: "visible", timeout: 6_000 }).catch(() => {});

  // ── Open the first real account card ──
  // Prefer .acct-card (calibrated in viewsweep.js). Fallback to first [role="button"]
  // that isn't a nav label.
  let openedAccount = false;
  try {
    const acctCard = page.locator(".acct-card").first();
    if (await acctCard.isVisible().catch(() => false)) {
      await acctCard.click({ timeout: 4000 });
      openedAccount = true;
    } else {
      const cards = page.locator(S.accountCard);
      const count = await cards.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        const text = await card.textContent().catch(() => "");
        if (/^(Home|Accounts|Calendar|Cadence|Gauge|Settings)$/i.test((text || "").trim())) continue;
        await card.click({ timeout: 4000 }).catch(() => {});
        openedAccount = true;
        break;
      }
    }
  } catch (_) {}

  if (!openedAccount) {
    results.push({
      name: "contact creation smoke test",
      passed: false,
      skipped: true,
      note: "could not open an account card — no accounts in test user data?",
    });
    return results;
  }

  // Wait for account detail to render.
  await page.waitForTimeout(1200);

  // ── Click the Contacts tab ──
  let contactsTabVisible = false;
  try {
    await page.locator('button:has-text("Contacts")').first().click({ timeout: 4000 });
    await page.waitForTimeout(800);
    contactsTabVisible = true;
  } catch (_) {}

  if (!contactsTabVisible) {
    results.push({
      name: "Contacts tab accessible",
      passed: false,
      note: 'button:has-text("Contacts") not found or not clickable',
    });
    return results;
  }

  // ── Click "+ Add Contact" ──
  // ContactsTab renders an AmberBtn with text "+ Add Contact" which calls onAdd.
  // onAdd opens AddContactModal (a separate Modal overlay).
  let addClicked = false;
  try {
    await page.locator('button:has-text("+ Add Contact")').first().click({ timeout: 4000 });
    addClicked = true;
  } catch (_) {
    addClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /\+\s*add contact/i.test(b.textContent));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // ── Wait for AddContactModal — keyed on #contact-name input ──
  const contactNameInput = page.locator("#contact-name").first();
  const modalOpen = await contactNameInput.waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false);

  if (!modalOpen) {
    results.push({
      name: "Add Contact modal opens",
      passed: false,
      note: `#contact-name never appeared — addClicked:${addClicked}`,
    });
    return results;
  }
  results.push({ name: "Add Contact modal opens", passed: true, note: "modal open" });

  // ── Fill the contact name ──
  const contactName = `_stresscontact_${Date.now()}`;
  await contactNameInput.fill(contactName).catch(() => {});

  // ── Watch for the REST insert ──
  const inserts = [];
  const onResp = (res) => {
    try {
      const u = res.url();
      const m = res.request().method();
      if (u.includes("/rest/v1/folio_contacts") && (m === "POST" || m === "PATCH")) {
        inserts.push({ method: m, status: res.status() });
      }
    } catch (_) {}
  };
  page.on("response", onResp);

  // ── Save: native click first, then DOM fallback ──
  let saveClicked = false;
  try {
    // AddContactModal save button is an AmberBtn with text "Add Contact".
    await page.locator('.modal-sheet button:has-text("Add Contact")').first().click({ timeout: 3000 });
    saveClicked = true;
  } catch (_) {
    saveClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".modal-sheet button"));
      const b = btns.find((x) => /add contact/i.test((x.textContent || "").trim()));
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // ── Wait for modal close or a successful insert response ──
  let sawInsertOk = false;
  let modalClosed = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    sawInsertOk = inserts.some((r) => r.status >= 200 && r.status < 300);
    modalClosed = !(await contactNameInput.isVisible().catch(() => false));
    if (sawInsertOk || modalClosed) break;
  }
  const insertSummary = inserts.length ? inserts.map((r) => `${r.method}:${r.status}`).join(",") : "NONE";
  page.off("response", onResp);

  results.push({
    name: "contact save fired a DB write (modal closed / insert ok)",
    passed: sawInsertOk || modalClosed,
    note: `db requests: [${insertSummary}]; modal closed: ${modalClosed}; saveClicked: ${saveClicked}`,
  });

  // ── REST verify + cleanup ──
  const token = await getAccessToken(page);
  const base = (config.supabase && config.supabase.url) ? config.supabase.url.replace(/\/$/, "") : "";
  let persisted = false;
  let contactId = null;
  let cleanupOk = false;

  if (token && base) {
    const headers = { apikey: config.supabase.anonKey, Authorization: "Bearer " + token };
    try {
      const r = await fetch(`${base}/rest/v1/folio_contacts?name=eq.${encodeURIComponent(contactName)}&select=id,account_id`, { headers });
      const rows = r.ok ? await r.json() : [];
      persisted = Array.isArray(rows) && rows.length > 0;
      if (persisted) {
        contactId = rows[0].id;
        const del = await fetch(`${base}/rest/v1/folio_contacts?name=eq.${encodeURIComponent(contactName)}`, {
          method: "DELETE",
          headers,
        });
        cleanupOk = del.ok;
      }
    } catch (_) {}
  }

  results.push({
    name: "contact created + persisted",
    passed: persisted,
    note: persisted
      ? ("confirmed in DB (id: " + contactId + ")" + (cleanupOk ? "; test row cleaned up" : "; cleanup skipped/failed"))
      : (token ? "row not found via API — contact may not have persisted" : "no auth token — could not verify"),
  });

  return results;
}
