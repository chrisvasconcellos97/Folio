// Auth boundary tests — login with valid creds, with bad creds, signup with weak password.

import { S } from "../selectors.js";

export async function run({ page, config }) {
  const results = [];

  // 1. Bad password — should NOT log in.
  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  await page.fill(S.authEmail, config.user.email).catch(() => {});
  await page.fill(S.authPassword, "definitely-wrong-password").catch(() => {});
  await page.click(S.authSubmit).catch(() => {});
  await page.waitForTimeout(2000);
  const stillOnAuth = await page.$(S.loggedOut).catch(() => null);
  results.push({
    name: "bad password is rejected",
    passed: !!stillOnAuth,
    note: stillOnAuth ? "stayed on auth screen" : "logged in with wrong password — auth broken",
  });

  // 2. Weak password on signup — should NOT create account.
  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  const signupToggle = await page.$(S.authToggleSignup).catch(() => null);
  if (signupToggle) {
    await signupToggle.click().catch(() => {});
    await page.fill(S.authName, "Stress Bot").catch(() => {});
    await page.fill(S.authEmail, `weak-${Date.now()}@example.com`).catch(() => {});
    await page.fill(S.authPassword, "weak").catch(() => {});
    await page.click(S.authSubmit).catch(() => {});
    await page.waitForTimeout(1500);
    const stayed = await page.$(S.loggedOut).catch(() => null);
    results.push({
      name: "weak password is rejected on signup",
      passed: !!stayed,
      note: stayed ? "weak password blocked" : "weak password accepted — strength enforcement broken",
    });
  }

  // 3. Good login — should succeed.
  await page.goto(config.url, { waitUntil: "domcontentloaded" });
  const loginToggle = await page.$(S.authToggleLogin).catch(() => null);
  if (loginToggle) await loginToggle.click().catch(() => {});
  await page.fill(S.authEmail, config.user.email).catch(() => {});
  await page.fill(S.authPassword, config.user.password).catch(() => {});
  await page.click(S.authSubmit).catch(() => {});
  const ok = await page.waitForSelector(S.loggedIn, { timeout: 10_000 }).catch(() => null);
  results.push({
    name: "valid creds log in",
    passed: !!ok,
    note: ok ? "logged in" : "valid creds did not log in",
  });

  return results;
}
