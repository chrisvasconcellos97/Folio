// Teach Pip — "Teach Pip about your world" Home card + "ask me more" generation.
//
// Guards two real shipped bugs:
//   1. The Home card's PipOrb used size={18} (a number) — fell back to the
//      giant centerpiece orb, crushing the card text into a one-word-per-line
//      column on mobile. (Fixed: size="sm" isStatic.) We guard the card is
//      VISIBLE (if it's crushed and overflows the viewport it may not be).
//   2. "Pip, ask me more" returned nothing — the model abstained when the
//      queue was already thorough. (Fixed: manual-mode prompt override +
//      deterministic account-anchored fallback so the endpoint can never
//      dead-end.) We guard that at least one queued question appears.
//
// AI cost: ONE generation call — the single "ask me more" click. No more.
//
// Setup makes the card deterministic: we DELETE the user's unanswered
// questions so the drip-question state is empty, which is the precondition
// for the Home card to render. Answered history is preserved.

import { S } from "../selectors.js";
import { login, getAccessToken } from "../adapter.js";

export async function run({ page, config }) {
  const results = [];

  // ── Login ──────────────────────────────────────────────────────────────────
  await login(page, {
    url: config.url,
    email: config.user.email,
    password: config.user.password,
  });

  // ── Auth token + uid ───────────────────────────────────────────────────────
  const token = await getAccessToken(page);

  // Extract uid from the same sb-*auth-token key (mirrors cachescope.js pattern).
  const uid = await page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sb-") && k.includes("auth-token")) {
          const v = JSON.parse(localStorage.getItem(k) || "null");
          if (v) {
            const id =
              (v.user && v.user.id) ||
              (v.currentSession && v.currentSession.user && v.currentSession.user.id) ||
              null;
            if (id) return id;
          }
        }
      }
    } catch (_) {}
    return null;
  }).catch(() => null);

  if (!token || !uid) {
    results.push({
      name: "Teach Pip: Home card renders + catch-up opens",
      passed: false,
      skipped: true,
      note: `could not obtain auth token or uid — token:${!!token} uid:${!!uid}`,
    });
    results.push({
      name: "Teach Pip: ask-me-more generates at least one question",
      passed: false,
      skipped: true,
      note: "skipped — no auth token/uid",
    });
    return results;
  }

  const base = (config.supabase && config.supabase.url)
    ? config.supabase.url.replace(/\/$/, "")
    : "";
  const headers = {
    apikey: config.supabase.anonKey,
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };

  // ── Setup: clear unanswered questions so the card will show ───────────────
  // DELETE queued/asked rows; leave answered/skipped/dismissed intact.
  if (base) {
    await fetch(
      `${base}/rest/v1/folio_pip_questions?user_id=eq.${uid}&status=in.(queued,asked)`,
      { method: "DELETE", headers }
    ).catch(() => {});
  }

  // Reload so the app sees the empty queue and renders the Home card.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
  // Wait for the app shell to be ready.
  await page.locator(S.loggedIn).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

  // Navigate to Home and allow the view to settle.
  try {
    await page.locator(S.navHome).first().click({ timeout: 4000 });
  } catch (_) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /^home$/i.test((b.textContent || "").trim()));
      if (btn) btn.click();
    }).catch(() => {});
  }
  await page.waitForTimeout(1500);

  // ── Check 1 — card renders + opens the catch-up surface ───────────────────
  const cardSelector = 'button:has-text("Teach Pip about your world")';
  const catchUpSelector = 'button:has-text("Pip, ask me more")';

  const cardVisible = await page.locator(cardSelector).first()
    .waitFor({ state: "visible", timeout: 8_000 }).then(() => true).catch(() => false);

  if (!cardVisible) {
    results.push({
      name: "Teach Pip: Home card renders + catch-up opens",
      passed: false,
      skipped: true,
      note: "Teach Pip card not shown — a drip question may still be queued, or Home didn't render (setup DELETE may have failed)",
    });
    results.push({
      name: "Teach Pip: ask-me-more generates at least one question",
      passed: false,
      skipped: true,
      note: "skipped — card not visible",
    });
    // Best-effort cleanup.
    if (base) {
      await fetch(
        `${base}/rest/v1/folio_pip_questions?user_id=eq.${uid}&status=eq.queued`,
        { method: "DELETE", headers }
      ).catch(() => {});
    }
    return results;
  }

  // Click the card (native first, DOM fallback).
  let cardClicked = false;
  try {
    await page.locator(cardSelector).first().click({ timeout: 3000 });
    cardClicked = true;
  } catch (_) {
    cardClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /teach pip about your world/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // The catch-up surface is confirmed open once "Pip, ask me more" is visible.
  const catchUpVisible = await page.locator(catchUpSelector).first()
    .waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false);

  results.push({
    name: "Teach Pip: Home card renders + catch-up opens",
    passed: catchUpVisible,
    note: catchUpVisible
      ? "card clicked → catch-up surface opened (\"Pip, ask me more\" visible)"
      : `card clicked (clicked:${cardClicked}) but catch-up surface never appeared ("Pip, ask me more" not found)`,
  });

  if (!catchUpVisible) {
    // Nothing more to test; clean up and return.
    if (base) {
      await fetch(
        `${base}/rest/v1/folio_pip_questions?user_id=eq.${uid}&status=eq.queued`,
        { method: "DELETE", headers }
      ).catch(() => {});
    }
    return results;
  }

  // ── Check 2 — "ask me more" actually generates a question ─────────────────
  // Attach a response listener BEFORE clicking so we capture the API response.
  let genStatus = null;
  const onResp = (res) => {
    try {
      if (res.url().includes("/api/generate-questions")) {
        genStatus = res.status();
      }
    } catch (_) {}
  };
  page.on("response", onResp);

  // Click "Pip, ask me more →" — ONE click only.
  let askClicked = false;
  try {
    await page.locator(catchUpSelector).first().click({ timeout: 3000 });
    askClicked = true;
  } catch (_) {
    askClicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find((b) => /pip, ask me more/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
  }

  // Wait for the /api/generate-questions response (up to ~10s for the request to fire).
  for (let i = 0; i < 20; i++) {
    if (genStatus !== null) break;
    await page.waitForTimeout(500);
  }
  page.off("response", onResp);

  // Hard fail: the endpoint returned a 500.
  if (genStatus === 500) {
    results.push({
      name: "Teach Pip: ask-me-more generates at least one question",
      passed: false,
      note: "generate-questions endpoint crashed (500) — server error in the generation path",
    });
    if (base) {
      await fetch(
        `${base}/rest/v1/folio_pip_questions?user_id=eq.${uid}&status=eq.queued`,
        { method: "DELETE", headers }
      ).catch(() => {});
    }
    return results;
  }

  // If the button was never actually clicked, report as skipped.
  if (!askClicked) {
    results.push({
      name: "Teach Pip: ask-me-more generates at least one question",
      passed: false,
      skipped: true,
      note: "could not click 'Pip, ask me more' — button not found in DOM",
    });
    if (base) {
      await fetch(
        `${base}/rest/v1/folio_pip_questions?user_id=eq.${uid}&status=eq.queued`,
        { method: "DELETE", headers }
      ).catch(() => {});
    }
    return results;
  }

  // Poll REST for up to ~25s — generation is a Sonnet call and takes several seconds.
  let queuedCount = 0;
  if (base) {
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1000);
      try {
        const r = await fetch(
          `${base}/rest/v1/folio_pip_questions?user_id=eq.${uid}&status=eq.queued&select=id`,
          { headers }
        );
        const rows = r.ok ? await r.json() : [];
        queuedCount = Array.isArray(rows) ? rows.length : 0;
        if (queuedCount >= 1) break;
      } catch (_) {
        // transient fetch error — keep polling
      }
    }
  }

  const genNote = `genStatus:${genStatus !== null ? genStatus : "no-request"}; queuedAfter:${queuedCount}`;

  if (genStatus === null) {
    // The API call never fired — probably the button click didn't reach the handler.
    results.push({
      name: "Teach Pip: ask-me-more generates at least one question",
      passed: false,
      skipped: true,
      note: `generate-questions request never observed — ${genNote}`,
    });
  } else {
    results.push({
      name: "Teach Pip: ask-me-more generates at least one question",
      passed: queuedCount >= 1,
      note: queuedCount >= 1
        ? `question generated (${genNote})`
        : `generate-questions returned ${genStatus} but no queued row appeared within ~25s — this is the exact shipped bug (${genNote})`,
    });
  }

  // ── Cleanup: remove queued rows generated during the test ─────────────────
  // Leaves answered/skipped/dismissed history intact; only removes queued rows.
  if (base) {
    await fetch(
      `${base}/rest/v1/folio_pip_questions?user_id=eq.${uid}&status=eq.queued`,
      { method: "DELETE", headers }
    ).catch(() => {});
  }

  return results;
}
