// Hostile-input resilience test.
//
// Creates accounts through the UI with emoji/unicode, very long strings, and
// an XSS injection payload. Verifies the app:
//   - stores the rows without crashing (REST query check)
//   - doesn't execute injected HTML (XSS-safe React escaping)
//   - shows no ErrorBoundary after each submission
//
// Pattern mirrors accounts.js: native-then-DOM-fallback clicks, REST verify + DELETE cleanup.

import { S } from "../selectors.js";
import { login, getAccessToken } from "../adapter.js";

// DOM-fallback click helper (mirrors accounts.js pattern).
async function clickAddAccount(page) {
  const addBtn = page.locator(S.addAccount).first();
  const addVisible = await addBtn.isVisible().catch(() => false);
  if (!addVisible) return false;
  try {
    await addBtn.click({ timeout: 3000 });
    return true;
  } catch (_) {
    return await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /add account|\+ account/i.test(b.textContent));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
  }
}

async function saveModal(page) {
  try {
    await page.locator(S.modalSave).first().click({ timeout: 3000 });
    return true;
  } catch (_) {
    return await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".modal-sheet button"));
      const b = btns.find((x) => /^(add account|add department|add partner|save)/i.test((x.textContent || "").trim().toLowerCase()));
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
  }
}

async function waitForModalClose(page) {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    const open = await page.locator(S.modalNameInput).first().isVisible().catch(() => false);
    if (!open) return true;
  }
  return false;
}

async function noErrorBoundary(page) {
  return !(await page.locator('[role="alert"]:has-text("Reload")').first().isVisible().catch(() => false));
}

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // Navigate to Accounts so the Add Account button is present.
  await page.locator(S.navAccounts).first().click({ timeout: 4000 }).catch(() => {});
  await page.locator(S.searchInput).first().waitFor({ state: "visible", timeout: 6_000 }).catch(() => {});

  const token = await getAccessToken(page);
  const base = (config.supabase && config.supabase.url) ? config.supabase.url.replace(/\/$/, "") : "";
  const restHeaders = token ? { apikey: config.supabase.anonKey, Authorization: "Bearer " + token } : null;

  const ts = Date.now();

  // The three payloads: [caseName, accountName, notesPayload]
  const cases = [
    ["emoji-unicode", `_stress_emoji_${ts}_🔥🅰ząlgo`, null],
    ["very-long",     `_stress_long_${ts}_` + "A".repeat(5000), null],
    ["xss-injection", `_stress_xss_${ts}`, `<img src=x onerror="window.__xss_fired=1"><script>window.__xss_fired=1</script>`],
  ];

  // Track all created names so we can clean up at the end.
  const createdNames = [];

  for (const [caseName, acctName, notesPayload] of cases) {
    // ── Pre-flight for XSS case ──
    if (caseName === "xss-injection") {
      await page.evaluate(() => { window.__xss_fired = 0; }).catch(() => {});
    }

    // ── Open modal ──
    await clickAddAccount(page);
    const nameInput = page.locator(S.modalNameInput).first();
    const modalOpen = await nameInput.waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false);
    if (!modalOpen) {
      results.push({ name: caseName + ": modal opened", passed: false, note: "modal never appeared — skipping case" });
      continue;
    }

    // ── Fill name (truncate to 2000 chars to keep fill performance reasonable) ──
    const fillName = acctName.slice(0, 2000);
    await nameInput.fill(fillName).catch(() => {});

    // ── Fill notes/objective if we have a hostile payload ──
    if (notesPayload) {
      // #account-notes is the stable id on the notes TextArea in AddAccountModal.
      await page.locator("#account-notes").fill(notesPayload).catch(() => {});
    }

    // ── Save ──
    await saveModal(page);
    const closed = await waitForModalClose(page);

    results.push({
      name: caseName + ": modal accepted input without freezing",
      passed: closed,
      note: closed ? "modal closed after save" : "modal still open after 6s — may be a validation block",
    });

    // ── XSS check ── (must happen while on the same page, before navigation)
    if (caseName === "xss-injection") {
      // Give the page a moment to render whatever was saved.
      await page.waitForTimeout(800);
      const xssFired = await page.evaluate(() => window.__xss_fired).catch(() => 0);
      results.push({
        name: "injected HTML is not executed (XSS-safe)",
        passed: !xssFired,
        note: xssFired
          ? "window.__xss_fired was set — React did NOT escape the payload"
          : "window.__xss_fired remains 0 — React escaped the payload correctly",
      });
    }

    // ── No ErrorBoundary ──
    const nocrash = await noErrorBoundary(page);
    results.push({
      name: caseName + ": no view crash after submission",
      passed: nocrash,
      note: nocrash ? "no ErrorBoundary visible" : "ErrorBoundary/Reload alert found after submission",
    });

    // ── REST verify persistence ──
    let persisted = false;
    if (restHeaders && base) {
      try {
        const r = await fetch(`${base}/rest/v1/folio_accounts?name=eq.${encodeURIComponent(fillName)}&select=id`, { headers: restHeaders });
        const rows = r.ok ? await r.json() : [];
        persisted = Array.isArray(rows) && rows.length > 0;
      } catch (_) {}
    }
    results.push({
      name: `app stored ${caseName} input without crashing`,
      passed: persisted,
      note: persisted
        ? "row confirmed in DB"
        : (restHeaders
            ? "row not found via API — create may not have persisted, or name was truncated by the DB"
            : "no auth token — could not verify"),
    });

    if (persisted) createdNames.push(fillName);
  }

  // ── Cleanup: DELETE every row we created ──
  if (restHeaders && base) {
    for (const name of createdNames) {
      await fetch(`${base}/rest/v1/folio_accounts?name=eq.${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: restHeaders,
      }).catch(() => {});
    }
  }

  return results;
}
