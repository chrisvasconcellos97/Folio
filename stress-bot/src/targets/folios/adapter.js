// Folios target adapter — describes the app to the runner.
// Exposes: login, logout, getAccessToken, nav targets, list of scenarios.

import { S } from "./selectors.js";
import * as auth from "./scenarios/auth.js";
import * as accounts from "./scenarios/accounts.js";
import * as meetings from "./scenarios/meetings.js";
import * as cadences from "./scenarios/cadences.js";
import * as pip from "./scenarios/pip.js";
import * as rls from "./scenarios/rls.js";
import * as viewsweep from "./scenarios/viewsweep.js";
import * as apihealth from "./scenarios/apihealth.js";
import * as cachescope from "./scenarios/cachescope.js";
import * as nastyinputs from "./scenarios/nastyinputs.js";
import * as contacts from "./scenarios/contacts.js";
import * as gauge from "./scenarios/gauge.js";
import * as integrity from "./scenarios/integrity.js";

export const scenarios = { auth, accounts, meetings, cadences, pip, rls, viewsweep, apihealth, cachescope, nastyinputs, contacts, gauge, integrity };

// Folios is a state-based SPA — it has no client-side URL routes, so the only
// real URL is "/". The fuzz layer churns views by CLICKING nav buttons
// (navTargets) instead of navigating URLs (which would just reload Home).
export const routes = ["/"];

export const navTargets = [
  S.navHome,
  S.navAccounts,
  S.navMeetings,
  S.navCadence,
  S.navGauge,
];

// Shared login helper used by scenarios + fuzz setup.
//
// The old version checked the logged-in marker *immediately* after goto —
// before React restored the session and rendered — so it missed an existing
// session and then blindly tried to fill a login form that wasn't there,
// timing out after 30s. This version waits for the app to settle into EITHER
// the auth form or the app shell, then decides. If already logged in it
// returns fast (no 15s blind wait).
export async function login(page, { url, email, password }) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});

  // Race the two possible end states. Whichever renders first wins.
  const state = await Promise.race([
    page.locator(S.loggedIn).first().waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "in").catch(() => "timeout"),
    page.locator(S.authEmail).first().waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "out").catch(() => "timeout"),
  ]);

  if (state === "in") return;               // session restored — already in
  if (state === "timeout") {
    // Neither resolved cleanly; re-check directly before assuming logged out.
    if (await page.locator(S.loggedIn).first().isVisible().catch(() => false)) return;
  }

  // We're on the auth screen — make sure we're on Sign In, not Create Account.
  const signIn = page.locator(S.authToggleLogin).first();
  if (await signIn.isVisible().catch(() => false)) await signIn.click().catch(() => {});

  await page.fill(S.authEmail, email);
  await page.fill(S.authPassword, password);
  await page.click(S.authSubmit);

  // Wait for the app shell to appear (proves login worked).
  await page.locator(S.loggedIn).first().waitFor({ state: "visible", timeout: 20_000 });
}

// Pull the Supabase access token out of localStorage so API-level scenarios
// can call /api/* as the logged-in user (the endpoints 401 anything without a
// Bearer token). Supabase-js v2 stores the session under sb-<ref>-auth-token.
export async function getAccessToken(page) {
  return await page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sb-") && k.includes("auth-token")) {
          const v = JSON.parse(localStorage.getItem(k) || "null");
          if (v && v.access_token) return v.access_token;
          if (v && v.currentSession && v.currentSession.access_token) return v.currentSession.access_token;
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  });
}

export async function logout(page) {
  // Folios surfaces logout in UserMenu; if it's not findable, just clear storage.
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {}
}
