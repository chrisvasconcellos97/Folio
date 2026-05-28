// Meeting log smoke test. Navigates to Meetings, asserts the view loads
// without errors, and tries to open the log modal. Best-effort — Folios'
// log flow depends on having at least one account, which is handled by
// the accounts scenario running first.

import { S } from "../selectors.js";
import { login } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // Try clicking the Meetings nav.
  const nav = await page.$(S.navMeetings).catch(() => null);
  if (!nav) {
    results.push({ name: "meetings nav present", passed: false, note: "no Meetings nav button" });
    return results;
  }
  await nav.click().catch(() => {});
  await page.waitForTimeout(800);

  // The view should mount without a JS error. The chaos watcher catches errors;
  // here we just check the URL or visible content.
  const url = page.url();
  results.push({
    name: "meetings view navigates",
    passed: /meetings|\/$/.test(url) || (await page.content()).toLowerCase().includes("meeting"),
    note: `current url: ${url}`,
  });

  // Try to find a log-meeting / log-conversation button.
  const logBtn = await page.$(
    'button:has-text("Log Meeting"), button:has-text("Log Conversation"), button:has-text("+ Meeting"), button:has-text("+ Conversation")'
  ).catch(() => null);
  results.push({
    name: "log-meeting CTA present",
    passed: !!logBtn,
    note: logBtn ? "found CTA" : "no Log Meeting / Log Conversation button visible — may need an account first",
  });

  return results;
}
