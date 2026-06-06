// API endpoint crash probe.
//
// Confirms that no Pip/Vercel endpoint returns a 500 or "FUNCTION_INVOCATION_FAILED"
// when hit with an empty JSON body and no Authorization header.
//
// A 401 (no auth) or 400 (bad input) is a PASS — the function loaded and
// handled the request gracefully. A 500 or a body containing
// "FUNCTION_INVOCATION_FAILED" is a FAIL — it means the serverless function
// crashed before it could return a clean error (usually a missing key guard or
// a module-level SDK construction that threw).

import { login } from "../adapter.js";

const ENDPOINTS = [
  "/api/pip",
  "/api/ask-pip",
  "/api/business-review",
  "/api/detect-terminology",
  "/api/generate-questions",
  "/api/leadership-readout",
  "/api/pip-state-refresh",
  "/api/portfolio-brief",
  "/api/profile-synthesis",
  "/api/invite",
];

export async function run({ page, config }) {
  const results = [];

  // Log in so we are same-origin on the app (fetch goes to the right origin).
  await login(page, { url: config.url, email: config.user.email, password: config.user.password });

  // Probe each endpoint sequentially. No Authorization header — intentionally
  // unauthenticated so we exercise the early key / auth guard path only.
  for (const path of ENDPOINTS) {
    const probe = await page.evaluate(async ({ origin, path }) => {
      try {
        const r = await fetch(new URL(path, origin).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body = await r.text();
        return { status: r.status, body: body.slice(0, 300) };
      } catch (e) {
        return { status: "err", body: String(e && e.message ? e.message : e) };
      }
    }, { origin: config.url, path }).catch((e) => ({ status: "err", body: String(e && e.message ? e.message : e) }));

    const { status, body } = probe;
    const passed =
      status !== 500 &&
      !/FUNCTION_INVOCATION_FAILED/i.test(body || "");

    results.push({
      name: `${path} does not crash (no 500 / FUNCTION_INVOCATION_FAILED)`,
      passed,
      note: passed
        ? `status: ${status}`
        : `status: ${status} — ${(body || "").slice(0, 120)}`,
    });
  }

  return results;
}
