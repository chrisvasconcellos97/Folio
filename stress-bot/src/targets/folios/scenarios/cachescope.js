// Single-user cache-scoping check (cross-user-leak class).
//
// Catches the bug class where cached user data isn't namespaced per user-id.
// Real example: the Pip daily brief was once cached under "folio_daily_brief"
// with no user suffix — on a shared device one user's morning brief appeared
// for a different user.
//
// With a single logged-in user we assert that every sensitive localStorage
// cache key CONTAINS the user's id as a substring. If a key matches a
// sensitive prefix but lacks the user id, that is the bug.

import { login } from "../adapter.js";

// Sensitive key prefixes that MUST include the user-id to be safe.
// Matched case-insensitively; a key passes if it contains the userId anywhere.
const SENSITIVE_PREFIXES = [
  "folio_daily_brief",
  "folio_pip_state",
  "folio_brief",
];

export async function run({ page, config }) {
  const results = [];

  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // Give the app a moment to populate its caches after login.
  await page.waitForTimeout(2000);

  let userId = null;
  let allKeys = [];

  try {
    const data = await page.evaluate(() => {
      try {
        let uid = null;
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith("sb-") && k.includes("auth-token")) {
            const v = JSON.parse(localStorage.getItem(k) || "null");
            if (v) {
              uid = (v.user && v.user.id) ||
                    (v.currentSession && v.currentSession.user && v.currentSession.user.id) ||
                    null;
              if (uid) break;
            }
          }
        }
        return { userId: uid, keys: Object.keys(localStorage) };
      } catch (e) {
        return { userId: null, keys: [], error: String(e && e.message ? e.message : e) };
      }
    });
    userId = data.userId || null;
    allKeys = Array.isArray(data.keys) ? data.keys : [];
  } catch (e) {
    results.push({
      name: "read localStorage session data",
      passed: false,
      note: "page.evaluate threw: " + String(e && e.message ? e.message : e),
      skipped: true,
    });
    return results;
  }

  // Result 1: confirm we could extract the user id.
  results.push({
    name: "captured a user id from the session",
    passed: !!userId,
    note: userId ? "ok" : "could not read session user id — later checks are weaker",
  });

  // Result 2: assert every sensitive cache key contains the user id.
  try {
    const sensitivePrefixRe = new RegExp(
      SENSITIVE_PREFIXES.map((p) => p.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
    );

    const sensitiveKeys = allKeys.filter((k) => sensitivePrefixRe.test(k.toLowerCase()));

    let offenders = [];
    if (userId) {
      offenders = sensitiveKeys.filter((k) => !k.includes(userId));
    }

    const passed = userId ? offenders.length === 0 : true;
    const skipped = !userId;

    results.push({
      name: "sensitive cache keys are user-id-namespaced",
      passed: skipped ? true : passed,
      skipped,
      note: skipped
        ? "skipped — no userId available to validate against"
        : offenders.length === 0
          ? `all ${sensitiveKeys.length} sensitive cache key(s) are user-scoped`
          : `LEAK RISK — ${offenders.length} key(s) lack the user id: ${offenders.slice(0, 5).join(", ")}`,
    });
  } catch (e) {
    results.push({
      name: "sensitive cache keys are user-id-namespaced",
      passed: false,
      note: "check threw: " + String(e && e.message ? e.message : e),
    });
  }

  return results;
}
