// Orchestrator. Loads target adapter, runs scripted scenarios, runs fuzz,
// writes report. Returns exit code (0 = all pass, 1 = at least one fail).

import { chromium } from "playwright";
import { log } from "./lib/logger.js";
import { Reporter } from "./reporter.js";
import { attachPageWatchers } from "./lib/chaos.js";
import { runFuzz } from "./fuzz/monkey.js";

export async function run(config, opts) {
  const adapter = await loadAdapter(config.target);
  const reporter = new Reporter(config.reportDir);

  const browser = await chromium.launch({
    headless: opts.headed ? false : config.browser.headless,
    slowMo: config.browser.slowMoMs || 0,
  });
  const context = await browser.newContext({ viewport: config.browser.viewport });
  const page = await context.newPage();

  attachPageWatchers(page, (issue) => {
    reporter.addIssue(issue);
    if (issue.kind === "5xx" || issue.kind === "pageerror") log.warn(`${issue.kind}: ${issue.message}`);
  });

  try {
    if (!opts.fuzzOnly) {
      log.section("scripted scenarios");
      for (const name of config.scenarios) {
        const mod = adapter.scenarios[name];
        if (!mod) {
          log.warn(`no scenario '${name}' in adapter — skipping`);
          continue;
        }
        log.info(`scenario: ${name}`);
        let results = [];
        try {
          results = await mod.run({ page, config });
        } catch (e) {
          results = [{ name: `${name} (threw)`, passed: false, note: e.message }];
        }
        for (const r of results) (r.skipped ? log.warn : r.passed ? log.pass : log.fail).call(log, `${name} — ${r.name}`);
        reporter.addScenario(name, results);
      }
    }

    if (!opts.scriptedOnly && config.fuzz.durationMs > 0) {
      log.section("fuzz layer");
      try {
        await adapter.login(page, { url: config.url, email: config.user.email, password: config.user.password });
      } catch (e) {
        log.warn("could not log in for fuzz layer: " + e.message);
      }
      log.info(`fuzzing for ${Math.round(config.fuzz.durationMs / 1000)}s…`);
      const fuzzSummary = await runFuzz(page, adapter, config.fuzz, (issue) => reporter.addIssue(issue));
      reporter.setFuzz({ ...fuzzSummary, durationMs: config.fuzz.durationMs });
      log.info(`fuzz complete — ${fuzzSummary.ticks} actions`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const dir = await reporter.write();
  const sum = reporter.summary();

  // Echo failure detail + clustered passive issues to stdout so the whole
  // picture is readable straight from CI logs (no artifact download needed).
  const fails = [];
  for (const s of reporter.results.scenarios) {
    for (const r of s.results) {
      if (!r.skipped && !r.passed) fails.push(`${s.name} — ${r.name}: ${r.note || "(no note)"}`);
    }
  }
  if (fails.length) {
    log.section("failure detail");
    for (const f of fails) log.fail(f);
  }
  const clusters = reporter.cluster();
  if (clusters.length) {
    log.section("passive issue clusters");
    for (const c of clusters) log.warn(`[${c.kind} ×${c.count}] ${(c.sample || "").slice(0, 180)}`);
  }

  log.section("summary");
  log.info(`pass=${sum.pass} fail=${sum.fail} skip=${sum.skip} passive_issues=${sum.issueCount}`);
  log.info(`report: ${dir}/report.html`);
  return sum.fail === 0 ? 0 : 1;
}

async function loadAdapter(name) {
  switch (name) {
    case "folios":
      return await import("./targets/folios/adapter.js");
    default:
      throw new Error(`unknown target adapter: ${name}`);
  }
}
