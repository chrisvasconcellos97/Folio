// Calendar view smoke test. The "Meetings" view is labeled "Calendar" in the
// nav. Folios is a state-based SPA (no URL change on nav), so we assert on
// rendered content, not the URL. Best-effort: the conversation/schedule CTAs
// are what we look for.

import { S } from "../selectors.js";
import { login } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  const nav = page.locator(S.navMeetings).first();
  if (!(await nav.isVisible().catch(() => false))) {
    results.push({ name: "Calendar nav present", passed: false, note: 'no "Calendar" nav button found' });
    return results;
  }
  await nav.click().catch(() => {});
  await page.waitForTimeout(900);

  // View should mount and render calendar/meeting content (chaos watchers catch
  // any JS error separately).
  const content = (await page.content()).toLowerCase();
  const mounted = /calendar|meeting|today|month|week/.test(content);
  results.push({
    name: "Calendar view mounts",
    passed: mounted,
    note: mounted ? "calendar content rendered" : "no calendar/meeting content found after nav",
  });

  // Try to find a conversation / schedule CTA.
  const logBtn = page.locator(
    'button:has-text("Conversation"), button:has-text("Schedule Meeting"), button:has-text("Log")'
  ).first();
  const hasCta = await logBtn.isVisible().catch(() => false);
  results.push({
    name: "log/schedule CTA present",
    passed: hasCta,
    note: hasCta ? "found a conversation/schedule CTA" : "no conversation/schedule button visible",
  });

  return results;
}
