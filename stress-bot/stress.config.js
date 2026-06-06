// stress-bot configuration.
//
// Pick which target adapter to load and how aggressively to run.
// Anything app-specific (URLs, selectors, scenarios) lives in the adapter
// under src/targets/<name>/. This file just wires the pieces together.

import "dotenv/config";

export default {
  // Which target adapter to load. Add a new folder under src/targets/<name>/
  // and switch this to retarget at a different app.
  target: "folios",

  // Where the target app is deployed.
  url: process.env.TARGET_URL || "https://folioshq.com",

  // Test user creds (env-driven so they never end up in git).
  user: {
    email: process.env.TEST_USER_EMAIL || "",
    password: process.env.TEST_USER_PASSWORD || "",
  },

  // Optional second user — used by RLS boundary scenario only.
  userB: {
    email: process.env.TEST_USER_B_EMAIL || "",
    password: process.env.TEST_USER_B_PASSWORD || "",
  },

  // Direct Supabase access (optional — RLS scenario only).
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
  },

  // Scripted scenarios — deterministic flows. Each one returns
  // { passed, failed, notes[] }. Add/remove names to skip.
  scenarios: [
    "auth",
    "accounts",
    "nastyinputs",
    "viewsweep",
    "meetings",
    "cadences",
    "pip",
    "rls",
    "apihealth",
    "cachescope",
    "contacts",
    "gauge",
    "integrity",
  ],

  // Fuzz layer — random behaviors that run after scripted scenarios.
  fuzz: {
    // Total fuzz duration. Stop when this elapses.
    durationMs: 60_000,
    // Probability weights for each strategy. They must sum to >0.
    strategies: {
      monkeyClick: 3,    // click random visible elements
      fuzzInputs: 5,     // fill inputs with crazy values
      doubleSubmit: 1,   // rapid-fire form submits
      navChurn: 2,       // bounce between routes
    },
    // Pause between actions (random in this range).
    minDelayMs: 80,
    maxDelayMs: 350,
  },

  // Browser settings.
  browser: {
    headless: true,
    slowMoMs: 0,
    viewport: { width: 1440, height: 900 },
    // Capture screenshot + DOM snapshot on every failure.
    captureOnFailure: true,
  },

  // Where to write reports. Default: ./reports/<timestamp>/
  reportDir: "./reports",
};
