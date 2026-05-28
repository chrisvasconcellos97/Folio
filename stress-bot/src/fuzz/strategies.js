// Fuzz strategies. Each one takes a Playwright `page` and an optional
// adapter (for target-specific paths) and runs a single random action.
// Strategies should NEVER throw — they swallow errors and let the page
// watchers (chaos.js) report any real damage.

import { pickNasty } from "./inputs.js";
import { randInt, sleep } from "../lib/retry.js";

async function safe(fn) {
  try { await fn(); } catch {}
}

export const strategies = {
  // Click a random visible interactive element.
  async monkeyClick(page) {
    await safe(async () => {
      const targets = await page.$$(
        "button:visible, a:visible, [role='button']:visible, input[type='checkbox']:visible"
      );
      if (!targets.length) return;
      const el = targets[randInt(0, targets.length - 1)];
      await el.click({ timeout: 1000, force: false }).catch(() => {});
    });
  },

  // Fill every visible text input on the page with a nasty value.
  async fuzzInputs(page) {
    await safe(async () => {
      const inputs = await page.$$(
        "input:visible:not([type=submit]):not([type=button]), textarea:visible"
      );
      for (const input of inputs.slice(0, 8)) {
        await input.fill(pickNasty(), { timeout: 500 }).catch(() => {});
        await sleep(20);
      }
    });
  },

  // Rapid-fire double-submit — find a save/submit button, click twice fast.
  async doubleSubmit(page) {
    await safe(async () => {
      const btn = await page.$(
        "button:has-text('Save'), button:has-text('Log'), button:has-text('Add'), button[type='submit']"
      );
      if (!btn) return;
      await btn.click({ timeout: 500 }).catch(() => {});
      await btn.click({ timeout: 500, force: true }).catch(() => {});
    });
  },

  // Bounce between known routes to stress mount/unmount cycles.
  async navChurn(page, adapter) {
    await safe(async () => {
      const routes = adapter?.routes || ["/"];
      const r = routes[randInt(0, routes.length - 1)];
      await page.goto(new URL(r, page.url()).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 5000,
      }).catch(() => {});
    });
  },
};
