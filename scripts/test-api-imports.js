// Verify every Vercel API handler can be imported in Node.js ESM mode.
//
// This catches module-load failures (missing .js extensions, bad imports,
// module-level throws) that cause FUNCTION_INVOCATION_FAILED in production —
// a black-box Vercel error that gives no detail and is hard to debug remotely.
//
// Run: node scripts/test-api-imports.js
// Exit 0 = all handlers load cleanly. Exit 1 = at least one fails.

import { pathToFileURL } from "url";
import { resolve } from "path";

var handlers = [
  "api/pip.js",
  "api/ask-pip.js",
  "api/pip-state-refresh.js",
  "api/portfolio-brief.js",
  "api/business-review.js",
  "api/leadership-readout.js",
  "api/profile-synthesis.js",
  "api/detect-terminology.js",
  "api/generate-questions.js",
  "api/operator-run.js",
  "api/sports.js",
  "api/invite.js",
];

var failed = false;

for (var handler of handlers) {
  try {
    await import(pathToFileURL(resolve(handler)).href);
    console.log("  ✓ " + handler);
  } catch (e) {
    console.error("  ✗ " + handler + ": " + e.message);
    failed = true;
  }
}

if (failed) {
  console.error("\nOne or more API handlers failed to load. Fix the import errors above before deploying.");
  process.exit(1);
} else {
  console.log("\nAll API handlers load cleanly.");
}
