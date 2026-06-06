// Deterministic every-view error sweep.
//
// Visits every top-level nav surface and every account detail tab, flags any
// view that crashes to the React ErrorBoundary or emits a non-noise console
// error. Designed to catch render crashes (e.g. unguarded .split on null)
// reliably instead of relying on random fuzzing to stumble across them.

import { S } from "../selectors.js";
import { login } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];

  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // Collect page-level JS errors + console errors into a bucket.
  // Noise filter applied to console errors only (pageerror is always real).
  const noiseRe = /workbox|\[vite\]|HMR|status of 401|Clipboard|writeText|ERR_ABORTED|ERR_CANCEL/i;
  let bucket = [];

  const onPageError = (err) => {
    bucket.push("pageerror: " + (err && err.message ? err.message : String(err)));
  };
  const onConsole = (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!noiseRe.test(text)) {
        bucket.push("console.error: " + text.slice(0, 200));
      }
    }
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  // Helper: clear bucket, run gotoFn, dwell, then check for a crash.
  const sweep = async (label, gotoFn) => {
    bucket = [];
    try {
      await gotoFn();
    } catch (_) {}
    await page.waitForTimeout(1200);

    let crashed = false;
    try {
      // The app's ErrorBoundary renders role="alert" containing a "Reload" button.
      crashed = await page.locator('[role="alert"]:has-text("Reload")').first().isVisible();
    } catch (_) {
      crashed = false;
    }

    const snap = bucket.slice();
    results.push({
      name: "no crash/errors on " + label,
      passed: !crashed && snap.length === 0,
      note: crashed
        ? "VIEW CRASHED to ErrorBoundary"
        : snap.length
          ? snap.slice(0, 3).join(" | ")
          : "clean",
    });
  };

  // ── Top-level nav surfaces ──────────────────────────────────────────────────

  await sweep("Home", async () => {
    await page.locator(S.navHome).first().click({ timeout: 4000 }).catch(() => {});
  });

  await sweep("Accounts", async () => {
    await page.locator(S.navAccounts).first().click({ timeout: 4000 }).catch(() => {});
  });

  await sweep("Calendar", async () => {
    await page.locator(S.navMeetings).first().click({ timeout: 4000 }).catch(() => {});
  });

  await sweep("Cadence", async () => {
    await page.locator(S.navCadence).first().click({ timeout: 4000 }).catch(() => {});
  });

  await sweep("Gauge", async () => {
    await page.locator(S.navGauge).first().click({ timeout: 4000 }).catch(() => {});
  });

  // ── Account detail tabs ─────────────────────────────────────────────────────
  // Navigate to Accounts, then open the first account card to get an account
  // detail view, then sweep each tab.

  // Return to Accounts list so account cards are present.
  await page.locator(S.navAccounts).first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Click the first account card. Prefer .acct-card if it exists, otherwise
  // use the first S.accountCard that is inside the list area.
  let openedAccount = false;
  try {
    const acctCard = page.locator(".acct-card").first();
    const hasAcctCard = await acctCard.isVisible().catch(() => false);
    if (hasAcctCard) {
      await acctCard.click({ timeout: 4000 });
      openedAccount = true;
    } else {
      // Fallback: click the first [role="button"] that is not a nav button.
      const cards = page.locator(S.accountCard);
      const count = await cards.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        const text = await card.textContent().catch(() => "");
        // Skip buttons whose entire text matches a nav label.
        if (/^(Home|Accounts|Calendar|Cadence|Gauge|Settings)$/i.test((text || "").trim())) continue;
        await card.click({ timeout: 4000 }).catch(() => {});
        openedAccount = true;
        break;
      }
    }
  } catch (_) {}

  await page.waitForTimeout(1200);

  if (!openedAccount) {
    results.push({
      name: "account detail tabs sweep",
      passed: false,
      note: "skipped — could not open an account card (no accounts in test user data?)",
      skipped: true,
    });
  } else {
    // Sweep each standard account detail tab.
    const tabs = ["Overview", "Meetings", "Tasks", "Contacts", "Cadence", "Projects", "Updates"];
    for (const label of tabs) {
      await sweep("account tab: " + label, async () => {
        await page.locator(`button:has-text("${label}")`).first().click({ timeout: 4000 }).catch(() => {});
      });
    }
  }

  // ── Clean up listeners ──────────────────────────────────────────────────────
  page.off("pageerror", onPageError);
  page.off("console", onConsole);

  return results;
}
