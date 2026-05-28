// Folios target adapter — describes the app to the runner.
// Exposes: login, logout, known routes, list of scenarios.

import { S } from "./selectors.js";
import * as auth from "./scenarios/auth.js";
import * as accounts from "./scenarios/accounts.js";
import * as meetings from "./scenarios/meetings.js";
import * as cadences from "./scenarios/cadences.js";
import * as pip from "./scenarios/pip.js";
import * as rls from "./scenarios/rls.js";

export const scenarios = { auth, accounts, meetings, cadences, pip, rls };

// Routes the fuzz layer will bounce between.
export const routes = [
  "/",
  "/meetings",
  "/cadence",
  "/pipeline",
  "/routes",
];

// Shared login helper used by scenarios + fuzz setup.
export async function login(page, { url, email, password }) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  // If we're already logged in (e.g. session cookie), bail.
  if (await page.$(S.loggedIn).catch(() => null)) return;

  // Make sure we're on Sign In, not Create Account.
  const signInToggle = await page.$(S.authToggleLogin).catch(() => null);
  if (signInToggle) await signInToggle.click().catch(() => {});

  await page.fill(S.authEmail, email);
  await page.fill(S.authPassword, password);
  await page.click(S.authSubmit);

  // Wait for nav to appear (proves login worked).
  await page.waitForSelector(S.loggedIn, { timeout: 10_000 });
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
