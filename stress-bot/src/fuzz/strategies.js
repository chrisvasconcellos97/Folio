// Fuzz strategies. Each one takes a Playwright `page` and an optional
// adapter (for target-specific paths) and runs a single random action.
// Strategies should NEVER throw — they swallow errors and let the page
// watchers (chaos.js) report any real damage.

import { pickNasty } from "./inputs.js";
import { randInt, sleep } from "../lib/retry.js";

async function safe(fn) {
  try { await fn(); } catch {}
}

// Buttons we must NOT click during fuzzing — clicking these would log the bot
// out (ending the authenticated session) and waste the rest of the run.
const AVOID_CLICK = /log\s*out|sign\s*out|logout/i;

export const strategies = {
  // Click a random visible interactive element — but never the logout control.
  async monkeyClick(page) {
    await safe(async () => {
      const targets = await page.$$(
        "button:visible, a:visible, [role='button']:visible, input[type='checkbox']:visible"
      );
      if (!targets.length) return;
      // Try a few times to land on a non-logout element.
      for (let attempt = 0; attempt < 4; attempt++) {
        const el = targets[randInt(0, targets.length - 1)];
        const label = ((await el.textContent().catch(() => "")) || "").trim();
        if (AVOID_CLICK.test(label)) continue;
        await el.click({ timeout: 1000, force: false }).catch(() => {});
        return;
      }
    });
  },

  // Fill several visible text inputs with nasty values (10k chars, SQL/XSS,
  // emoji, prompt-injection, etc — see inputs.js).
  async fuzzInputs(page) {
    await safe(async () => {
      const inputs = await page.$$(
        "input:visible:not([type=submit]):not([type=button]):not([type=password]), textarea:visible"
      );
      for (const input of inputs.slice(0, 8)) {
        await input.fill(pickNasty(), { timeout: 500 }).catch(() => {});
        await sleep(20);
      }
    });
  },

  // Rapid-fire double-submit — find a save/submit button, click twice fast.
  // Catches duplicate-write bugs. Skips logout-ish buttons.
  async doubleSubmit(page) {
    await safe(async () => {
      const btn = await page.$(
        "button:has-text('Save'), button:has-text('Log Meeting'), button:has-text('Add'), button[type='submit']"
      );
      if (!btn) return;
      const label = ((await btn.textContent().catch(() => "")) || "").trim();
      if (AVOID_CLICK.test(label)) return;
      await btn.click({ timeout: 500 }).catch(() => {});
      await btn.click({ timeout: 500, force: true }).catch(() => {});
    });
  },

  // Churn between in-app views to stress React mount/unmount. Folios is a
  // state-based SPA (no URL routes), so we CLICK nav buttons rather than
  // navigating URLs (which would just reload Home and lose the session view).
  async navChurn(page, adapter) {
    await safe(async () => {
      const navTargets = (adapter && adapter.navTargets) || [];
      if (navTargets.length) {
        const sel = navTargets[randInt(0, navTargets.length - 1)];
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 1500 }).catch(() => {});
          return;
        }
      }
      // Fallback: reload Home.
      await page.goto(new URL("/", page.url()).toString(), {
        waitUntil: "domcontentloaded", timeout: 5000,
      }).catch(() => {});
    });
  },
};
