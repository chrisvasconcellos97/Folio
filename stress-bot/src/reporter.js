// Writes a JSON + HTML report to <reportDir>/<timestamp>/.
// Also clusters passive issues (console errors, 5xx, requestfailed) by message
// prefix so the report doesn't drown in 200 identical "API/foo failed" lines.

import fs from "node:fs/promises";
import path from "node:path";

export class Reporter {
  constructor(reportDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.dir = path.join(reportDir, stamp);
    this.results = { scenarios: [], fuzz: null, issues: [], startedAt: new Date().toISOString() };
  }

  async ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  addScenario(name, results) {
    this.results.scenarios.push({ name, results });
  }

  setFuzz(summary) {
    this.results.fuzz = summary;
  }

  addIssue(issue) {
    this.results.issues.push({ ...issue, at: new Date().toISOString() });
  }

  cluster() {
    const groups = new Map();
    for (const i of this.results.issues) {
      const key = `${i.kind}:${(i.message || "").slice(0, 80)}`;
      if (!groups.has(key)) groups.set(key, { kind: i.kind, sample: i.message, count: 0 });
      groups.get(key).count++;
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }

  summary() {
    let pass = 0, fail = 0, skip = 0;
    for (const s of this.results.scenarios) {
      for (const r of s.results) {
        if (r.skipped) skip++;
        else if (r.passed) pass++;
        else fail++;
      }
    }
    return { pass, fail, skip, issueCount: this.results.issues.length };
  }

  async write() {
    await this.ensureDir();
    this.results.finishedAt = new Date().toISOString();
    this.results.summary = this.summary();
    this.results.clusteredIssues = this.cluster();
    await fs.writeFile(path.join(this.dir, "report.json"), JSON.stringify(this.results, null, 2));
    await fs.writeFile(path.join(this.dir, "report.html"), this.renderHtml());
    return this.dir;
  }

  renderHtml() {
    const s = this.results.summary || this.summary();
    const clusters = this.results.clusteredIssues || this.cluster();
    return `<!doctype html><html><head><meta charset="utf-8"><title>stress-bot report</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:900px;margin:2em auto;padding:0 1em;color:#222}
  h1{margin-bottom:0}.muted{color:#888}
  .summary{display:flex;gap:1em;margin:1em 0}
  .chip{padding:0.4em 0.8em;border-radius:6px;font-weight:600}
  .pass{background:#e0f5e6;color:#176b32}.fail{background:#fce8e8;color:#a32020}.skip{background:#eee;color:#555}
  table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14px}
  th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top}
  .ok{color:#176b32}.bad{color:#a32020;font-weight:600}
  code{background:#f5f5f5;padding:1px 4px;border-radius:3px;font-size:12px}
</style></head><body>
<h1>stress-bot report</h1>
<div class="muted">${this.results.startedAt} → ${this.results.finishedAt || ""}</div>
<div class="summary">
  <span class="chip pass">${s.pass} pass</span>
  <span class="chip fail">${s.fail} fail</span>
  <span class="chip skip">${s.skip} skipped</span>
  <span class="chip" style="background:#fff7e6;color:#8a5a00">${s.issueCount} passive issues</span>
</div>
${this.results.fuzz ? `<p>Fuzz layer: ${this.results.fuzz.ticks} actions over ${Math.round(this.results.fuzz.durationMs / 1000)}s.</p>` : ""}
${this.results.scenarios.map((s) => `
  <h2>${escape(s.name)}</h2>
  <table><thead><tr><th>Check</th><th>Result</th><th>Note</th></tr></thead><tbody>
  ${s.results.map((r) => `<tr>
    <td>${escape(r.name)}</td>
    <td class="${r.skipped ? "muted" : r.passed ? "ok" : "bad"}">${r.skipped ? "SKIP" : r.passed ? "PASS" : "FAIL"}</td>
    <td>${escape(r.note || "")}</td>
  </tr>`).join("")}
  </tbody></table>
`).join("")}
<h2>Clustered passive issues</h2>
${clusters.length ? `<table><thead><tr><th>Kind</th><th>Count</th><th>Sample</th></tr></thead><tbody>
${clusters.map((c) => `<tr><td><code>${escape(c.kind)}</code></td><td>${c.count}</td><td><code>${escape(c.sample || "")}</code></td></tr>`).join("")}
</tbody></table>` : `<p class="muted">No passive issues captured.</p>`}
</body></html>`;
  }
}

function escape(s) {
  return String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
