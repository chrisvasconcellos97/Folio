#!/usr/bin/env node
// Permanent CI guards — enforces four failure-class rules across the codebase.
// Run: node scripts/check-guards.js
// Exit 0 = all guards pass. Exit 1 = one or more guards found violations.
//
// Each guard is a function that returns an array of violation strings
// in the format "file:line — <guard-N> <description>".

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";

var ROOT = resolve(".");
var VIOLATIONS = [];

// ─── helpers ─────────────────────────────────────────────────────────────────

function walkFiles(dir, extensions, out) {
  if (!out) out = [];
  var entries;
  try { entries = readdirSync(dir); } catch (e) { return out; }
  for (var entry of entries) {
    // Skip node_modules, dist, .git, etc.
    if (entry === "node_modules" || entry === "dist" || entry === ".git" ||
        entry === "stress-bot" || entry === "public" || entry === "docs") continue;
    var full = join(dir, entry);
    var st;
    try { st = statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) {
      walkFiles(full, extensions, out);
    } else {
      var isMatch = extensions.some(function (ext) { return full.endsWith(ext); });
      if (isMatch) out.push(full);
    }
  }
  return out;
}

function readLines(filePath) {
  try {
    return readFileSync(filePath, "utf8").split("\n");
  } catch (e) {
    return [];
  }
}

function relPath(full) {
  return full.startsWith(ROOT + "/") ? full.slice(ROOT.length + 1) : full;
}

// ─── Guard 1: no silent death ─────────────────────────────────────────────────
// Flag TRULY EMPTY promise .catch() bodies — no comments, no code — in src/
// and api/ files. This is the tone-trend / promise-log / operator-report class:
// silent Supabase/fetch failures that kill features for weeks with zero signal.
//
// Allowlisted by a "guard-ok:" comment anywhere in the catch body, e.g.:
//   .catch(function () { /* guard-ok: reason */ })
//
// NOTE: Targets PROMISE .catch() only. Synchronous try-catch blocks are
// different (many legit best-effort localStorage ones) and are NOT flagged.

function guard1_noSilentDeath() {
  var violations = [];
  var files = [
    ...walkFiles(join(ROOT, "src"), [".js", ".jsx"]),
    ...walkFiles(join(ROOT, "api"), [".js"]),
  ];

  // Regex that matches a truly empty catch body: .catch(fn() {}) or .catch(() => {})
  // We consider it empty if it contains no non-whitespace characters besides the
  // brackets. A "guard-ok:" comment inside the braces = allowed.
  // We scan multi-line to handle cases that span lines, but we also do
  // line-by-line for single-line empty catches.

  // Single-line pattern: .catch(function(...) {}) or .catch(()=>{}) — body has only whitespace
  // Allow: body contains "guard-ok" anywhere.
  var SINGLE_LINE = /\.catch\(\s*(?:function\s*\([^)]*\)|(?:\([^)]*\)|\w+)\s*=>)\s*\{([^}]*)\}\s*\)/g;

  for (var filePath of files) {
    var content = readFileSync(filePath, "utf8");
    var lines = content.split("\n");
    var flagged = {}; // lineNo -> true, dedupe across the two passes

    // Single-line check: search each line
    lines.forEach(function (line, idx) {
      var lineNo = idx + 1;
      // Skip lines that are purely comments (start with // or * after trimming)
      var trimmedLine = line.trim();
      if (trimmedLine.startsWith("//") || trimmedLine.startsWith("*") || trimmedLine.startsWith("/*")) return;

      // Reset regex state
      SINGLE_LINE.lastIndex = 0;
      var m;
      while ((m = SINGLE_LINE.exec(line)) !== null) {
        var body = m[1] || "";
        // If body has NO non-whitespace content → it's empty.
        // If body contains "guard-ok" → it's allowlisted.
        if (body.trim() === "") {
          flagged[lineNo] = true;
          violations.push(relPath(filePath) + ":" + lineNo +
            " — guard-1 empty .catch() body (add logSilentFailure or /* guard-ok: reason */)");
        }
        // Advance past this match to avoid infinite loop on zero-length matches
        if (SINGLE_LINE.lastIndex === m.index) SINGLE_LINE.lastIndex++;
      }
    });

    // Multi-line check: the [^}]* class spans newlines, so running the same
    // pattern over the WHOLE file catches empty catches whose braces are on
    // different lines (e.g. `.catch(function () {\n})`). Dedupe against the
    // single-line pass, and skip matches that start on a comment line so
    // commented-out code isn't flagged.
    var MULTI = new RegExp(SINGLE_LINE.source, "g");
    var mm;
    while ((mm = MULTI.exec(content)) !== null) {
      var mbody = mm[1] || "";
      if (mbody.trim() === "") {
        var lineNo2 = content.slice(0, mm.index).split("\n").length;
        var startLine = (lines[lineNo2 - 1] || "").trim();
        if (!flagged[lineNo2] && !startLine.startsWith("//") && !startLine.startsWith("*")) {
          flagged[lineNo2] = true;
          violations.push(relPath(filePath) + ":" + lineNo2 +
            " — guard-1 empty .catch() body (add logSilentFailure or /* guard-ok: reason */)");
        }
      }
      if (MULTI.lastIndex === mm.index) MULTI.lastIndex++;
    }
  }

  return violations;
}

// ─── Guard 2: no date-format drift ────────────────────────────────────────────
// Flag any toLocaleDateString( call OUTSIDE src/lib/dateUtils.js.
// Allowlisted by a "// eslint-ok: one-off locale format" comment on the
// immediately preceding line, or a {/* eslint-ok: one-off locale format */}
// comment on the same or immediately preceding line.
// Batch 5 tagged every legitimate one-off with exactly this marker.

function guard2_noDateFormatDrift() {
  var violations = [];
  var files = walkFiles(join(ROOT, "src"), [".js", ".jsx"]);

  var DATEUTILSFILE = join(ROOT, "src", "lib", "dateUtils.js");

  for (var filePath of files) {
    // dateUtils.js is the canonical implementation — exempt
    if (filePath === DATEUTILSFILE) continue;

    var lines = readLines(filePath);
    lines.forEach(function (line, idx) {
      var lineNo = idx + 1;
      if (!line.includes("toLocaleDateString(")) return;
      // Skip lines that are themselves comments
      var trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;

      // Check for eslint-ok allowlist comment on the same line or previous line
      var prevLine = idx > 0 ? lines[idx - 1].trim() : "";
      var sameLine = line;
      var allowed =
        sameLine.includes("eslint-ok: one-off locale format") ||
        prevLine.includes("eslint-ok: one-off locale format");

      if (!allowed) {
        violations.push(relPath(filePath) + ":" + lineNo +
          " — guard-2 toLocaleDateString() outside dateUtils.js (use fmtShort/fmtMedium/fmtLong or add eslint-ok comment)");
      }
    });
  }

  return violations;
}

// ─── Guard 3: no unmetered Pip endpoint ───────────────────────────────────────
// Any api/*.js that imports @anthropic-ai/sdk MUST also import logPipUsage
// from ./_pipUsage.js.  After Batch 1 all 10 Pip endpoints log; sports.js and
// invite.js don't use the SDK so they're exempt.

function guard3_nounmeteredPipEndpoint() {
  var violations = [];
  var apiDir = join(ROOT, "api");
  var files;
  try { files = readdirSync(apiDir).map(function (f) { return join(apiDir, f); }); }
  catch (e) { return violations; }

  files = files.filter(function (f) { return f.endsWith(".js") && !f.endsWith("_pipUsage.js"); });

  for (var filePath of files) {
    var content;
    try { content = readFileSync(filePath, "utf8"); } catch (e) { continue; }

    var hasSDK = content.includes("@anthropic-ai/sdk") || content.includes("new Anthropic(");
    if (!hasSDK) continue; // not a Pip endpoint

    var hasUsage = content.includes("logPipUsage") && content.includes("_pipUsage.js");
    if (!hasUsage) {
      violations.push(relPath(filePath) +
        " — guard-3 imports @anthropic-ai/sdk but does not import logPipUsage from ./_pipUsage.js");
    }
  }

  return violations;
}

// ─── Guard 4: mobile input floor ──────────────────────────────────────────────
// Flag fontSize values of 10–15 on JSX <input>, <textarea>, or <select>
// elements in src/**/*.jsx.
//
// Heuristic: a sub-16 fontSize is flagged if:
//   1. The line contains `fontSize: 1[0-5]` (catches e.g. fontSize: 11, fontSize: "14px")
//   2. AND one of these is true:
//      a. The same line contains <input, <textarea, or <select
//      b. OR, looking back up to 12 lines, the nearest opening JSX tag is
//         <input, <textarea, or <select (not yet closed by a ">")
//
// This catches the original offenders (11px meeting-mode input, 10px select)
// without false-positiving on label/div text.

function guard4_mobileInputFloor() {
  var violations = [];
  var files = walkFiles(join(ROOT, "src"), [".jsx"]);

  // Strategy: scan the full file text and track when we're "inside" an open
  // form-control JSX element. We are "inside" an element from `<input`/
  // `<textarea`/`<select` until the element closes with `/>` or `>` (opening
  // tag end — self-closing or the end of the opening tag attributes).
  //
  // Within that span, any `fontSize: 1[0-5]` is a violation.
  //
  // We scan character by character via regex rather than line-by-line so we
  // can track nesting across lines accurately.
  //
  // Exemptions:
  //   - `<input type="checkbox"` / `type="radio"` / `type="range"` are exempt
  //     (the global CSS rule `@media (pointer: coarse)` already excludes them,
  //     and they don't render text)
  //   - Lines/spans that contain `// eslint-ok: mobile-input-ok` are exempt

  // Matches the opening of a form control tag.
  var TAG_OPEN  = /<(input|textarea|select)(\s|\/|>)/gi;
  // Matches the closing of an open tag (end of attributes).
  // We consider the tag "closed" (attribute region ends) when we see `/>` or `>`.
  var TAG_END   = /\/?>/;
  // Sub-16 fontSize in JSX style prop.
  var FONT_SMALL = /fontSize:\s*["']?1[0-5](?:px)?["']?/g;
  // Exempt types (no text input, covered by global CSS).
  var EXEMPT_TYPE = /type\s*=\s*["'](checkbox|radio|range)["']/i;

  for (var filePath of files) {
    var content = readFileSync(filePath, "utf8");
    var lines = content.split("\n");

    // Find all form-control element spans: [{tagName, start, end, lineStart}]
    // start/end are character offsets into content.
    var tagRe = /<(input|textarea|select)(\s|\/|>)/gi;
    var m;
    while ((m = tagRe.exec(content)) !== null) {
      var tagName = m[1].toLowerCase();
      var tagStart = m.index;
      // Find the end of this opening tag (first /> or > after tagStart)
      var tagEndIdx = content.indexOf(">", tagStart);
      if (tagEndIdx === -1) continue;
      // Include the ">" itself
      var tagEnd = tagEndIdx + 1;
      var tagSpan = content.slice(tagStart, tagEnd);

      // Skip exempt input types
      if (tagName === "input" && EXEMPT_TYPE.test(tagSpan)) continue;

      // Count line number for tagStart (for error reporting)
      var linesBefore = content.slice(0, tagStart).split("\n");
      var tagLineNo = linesBefore.length; // 1-based

      // Now check this span for sub-16 fontSize
      FONT_SMALL.lastIndex = 0;
      var fm;
      while ((fm = FONT_SMALL.exec(tagSpan)) !== null) {
        // Calculate line number of the fontSize occurrence
        var absOffset = tagStart + fm.index;
        var linesBeforeFontSize = content.slice(0, absOffset).split("\n");
        var fontLineNo = linesBeforeFontSize.length;
        var lineContent = lines[fontLineNo - 1] || "";
        // Exempt if the line or surrounding context has an eslint-ok marker
        var prevLine = fontLineNo > 1 ? (lines[fontLineNo - 2] || "") : "";
        if (lineContent.includes("mobile-input-ok") || prevLine.includes("mobile-input-ok")) continue;

        violations.push(relPath(filePath) + ":" + fontLineNo +
          " — guard-4 sub-16px fontSize on <" + tagName + "> (mobile input floor rule; fix to 16 or add /* mobile-input-ok: reason */)");
      }
    }
  }

  return violations;
}

// ─── Guard 5: no hooks below authLoading return ──────────────────────────────
// In App.jsx, all useState / useEffect / useMemo / useRef calls must appear
// ABOVE the `if (authLoading)` early-return line (React Hook Order Rule).
// Only checks App.jsx since that's where the early return lives.

function guard5_hookOrderAppJsx() {
  var violations = [];
  var appJsx = join(ROOT, "src", "App.jsx");
  if (!existsSync(appJsx)) return violations;

  var lines = readLines(appJsx);
  // Find the line index of the authLoading early return
  var earlyReturnIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (/if\s*\(\s*authLoading\s*\)/.test(lines[i])) {
      earlyReturnIdx = i;
      break;
    }
  }
  if (earlyReturnIdx === -1) return violations; // not found, can't check

  // Check all lines AFTER the early return for hook declarations
  var HOOK_RE = /\b(useState|useEffect|useMemo|useRef|useCallback)\s*[(<(]/;
  for (var j = earlyReturnIdx + 1; j < lines.length; j++) {
    var line = lines[j];
    var trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if (HOOK_RE.test(line)) {
      violations.push(relPath(appJsx) + ":" + (j + 1) +
        " — guard-5 hook call below authLoading early return (React Hook Order Rule: all hooks must be above the early return)");
    }
  }
  return violations;
}

// ─── Guard 6: no bare new Date("YYYY-MM-DD") ─────────────────────────────────
// Bare `new Date("YYYY-MM-DD")` parses in UTC, so it renders a day early in
// ET. Use `new Date("YYYY-MM-DD" + "T00:00:00")` or a dateUtils helper instead.
// Allowlisted by `// eslint-ok: utc-date-ok` on the same or previous line.
//
// Only scans src/**/*.{js,jsx} (not api/ — server-side date-at-midnight is fine).

function guard6_noBareIsoDate() {
  var violations = [];
  var files = walkFiles(join(ROOT, "src"), [".js", ".jsx"]);

  // Pattern: new Date("YYYY-MM-DD") where the string is ONLY a date (no T, no time)
  // Allow strings that have a T time component or a trailing Z.
  var BARE_DATE_RE = /new\s+Date\(\s*["'`]\d{4}-\d{2}-\d{2}["'`]\s*\)/g;

  for (var filePath of files) {
    var lines = readLines(filePath);
    lines.forEach(function (line, idx) {
      var lineNo = idx + 1;
      var trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      // Check allowlist
      var prevLine = idx > 0 ? lines[idx - 1] : "";
      if (line.includes("eslint-ok: utc-date-ok") || prevLine.includes("eslint-ok: utc-date-ok")) return;

      BARE_DATE_RE.lastIndex = 0;
      if (BARE_DATE_RE.test(line)) {
        violations.push(relPath(filePath) + ":" + lineNo +
          " — guard-6 bare new Date(\"YYYY-MM-DD\") renders a day early in ET; append \"T00:00:00\" or use a dateUtils helper");
      }
    });
  }
  return violations;
}

// ─── run all guards ───────────────────────────────────────────────────────────

console.log("Running check-guards.js...\n");

var g1 = guard1_noSilentDeath();
var g2 = guard2_noDateFormatDrift();
var g3 = guard3_nounmeteredPipEndpoint();
var g4 = guard4_mobileInputFloor();
var g5 = guard5_hookOrderAppJsx();
var g6 = guard6_noBareIsoDate();

function printGuard(name, violations) {
  if (violations.length === 0) {
    console.log("  ✓ " + name + " — clean");
  } else {
    console.error("  ✗ " + name + " — " + violations.length + " violation(s):");
    violations.forEach(function (v) { console.error("    " + v); });
  }
}

printGuard("Guard 1 (no silent death)", g1);
printGuard("Guard 2 (no date-format drift)", g2);
printGuard("Guard 3 (no unmetered Pip endpoint)", g3);
printGuard("Guard 4 (mobile input floor)", g4);
printGuard("Guard 5 (hook order in App.jsx)", g5);
printGuard("Guard 6 (no bare ISO date)", g6);

var total = g1.length + g2.length + g3.length + g4.length + g5.length + g6.length;
console.log("");
if (total > 0) {
  console.error("check-guards: " + total + " violation(s) found. Fix them before merging.");
  process.exit(1);
} else {
  console.log("check-guards: all guards pass.");
  process.exit(0);
}
