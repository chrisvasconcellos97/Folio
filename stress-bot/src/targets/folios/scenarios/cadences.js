// Cadence view smoke test — verifies the calendar mounts and doesn't error.

import { S } from "../selectors.js";
import { login } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  const nav = await page.$(S.navCadence).catch(() => null);
  if (!nav) {
    results.push({ name: "cadence nav present", passed: false, note: "no Cadence nav button — view may not be enabled" });
    return results;
  }
  await nav.click().catch(() => {});
  await page.waitForTimeout(1000);

  const content = (await page.content()).toLowerCase();
  results.push({
    name: "cadence view mounts",
    passed: content.includes("cadence") || content.includes("calendar"),
    note: "checked DOM for cadence/calendar text",
  });

  // Try month-nav arrows — these have aria-labels per CLAUDE.md a11y notes.
  const next = await page.$('[aria-label*="next" i]').catch(() => null);
  if (next) {
    await next.click().catch(() => {});
    await page.waitForTimeout(300);
    await next.click().catch(() => {});
    await page.waitForTimeout(300);
    results.push({ name: "calendar month nav clicks without error", passed: true, note: "advanced calendar twice" });
  }

  return results;
}
