#!/usr/bin/env node
// CLI entrypoint.
//
// Usage:
//   npm run stress                  # full run (scripted + fuzz)
//   npm run stress -- --scripted-only
//   npm run stress -- --fuzz-only
//   npm run stress -- --headed      # show the browser
//   npm run stress -- --scenarios=auth,accounts
//   npm run stress -- --fuzz-duration=120s

import config from "../stress.config.js";
import { run } from "./runner.js";

function parseArgs(argv) {
  const out = { headed: false, scriptedOnly: false, fuzzOnly: false };
  for (const a of argv) {
    if (a === "--headed") out.headed = true;
    else if (a === "--scripted-only") out.scriptedOnly = true;
    else if (a === "--fuzz-only") out.fuzzOnly = true;
    else if (a.startsWith("--scenarios=")) out.scenarios = a.slice(12).split(",").map((s) => s.trim());
    else if (a.startsWith("--fuzz-duration=")) out.fuzzDuration = parseDuration(a.slice(16));
  }
  return out;
}

function parseDuration(s) {
  const m = s.match(/^(\d+)(ms|s|m)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "ms" ? n : m[2] === "m" ? n * 60_000 : n * 1000;
}

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.scenarios) config.scenarios = opts.scenarios;
  if (opts.fuzzDuration != null) config.fuzz.durationMs = opts.fuzzDuration;

  if (!config.user.email || !config.user.password) {
    console.error("Missing TEST_USER_EMAIL / TEST_USER_PASSWORD. Copy .env.example to .env and fill them in.");
    process.exit(2);
  }
  try {
    const code = await run(config, opts);
    process.exit(code);
  } catch (e) {
    console.error("FATAL:", e);
    process.exit(2);
  }
})();
