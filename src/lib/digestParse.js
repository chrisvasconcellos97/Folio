// Email/Teams Digest Handoff (Game Plan Phase 1.3) — the two-brain bridge.
//
// Work Claude (corporate side) analyzes the inbox and emits a sanitized digest
// in this line format; Folios parses it deterministically — no AI call, no
// numbers. The matched work-Claude prompt lives in DigestIngestModal.
//
//   === FOLIOS DIGEST · 2026-06-10 ===
//   [OWE] Account Name | what I committed to | due: 2026-06-12
//   [WAITING] Account Name | Person Name | what they owe me | since: 2026-06-05
//   [QUIET] Account Name | Person Name | thread that went quiet | last: 2026-06-02
//   [TOUCH] Account Name | one-line qualitative note about the exchange
//   === END DIGEST ===
//
// Tolerance: header/footer optional, blank lines ignored, dates optional,
// account matched case-insensitively (exact → prefix → contains). Lines that
// don't parse come back in `unparsed` so the preview can show them instead of
// silently dropping anything.

var KINDS = ["OWE", "WAITING", "QUIET", "TOUCH"];

// Teams/Outlook paste mangles ASCII punctuation into Unicode lookalikes —
// curly quotes, fancy brackets, en/em dashes around the pipe — which silently
// broke the [TAG] regex and the | segment splitter. Normalize to ASCII first.
function normalizeDigestText(text) {
  return (text || "")
    .replace(/[‘’‚‛]/g, "'")   // ‘ ’ ‚ ‛ → '
    .replace(/[“”„‟]/g, '"')   // “ ” „ ‟ → "
    .replace(/[［【⟦❲]/g, "[")    // ［ 【 ⟦ ❲ → [
    .replace(/[］】⟧❳]/g, "]")    // ］ 】 ⟧ ❳ → ]
    .replace(/[｜│]/g, "|");               // ｜ │ → |
}

function matchAccount(name, accounts) {
  if (!name) return null;
  var n = name.trim().toLowerCase();
  if (!n) return null;
  var active = (accounts || []).filter(function (a) { return !a.is_inactive; });
  var exact = active.find(function (a) { return (a.name || "").toLowerCase() === n; });
  if (exact) return exact;
  var prefix = active.filter(function (a) { return (a.name || "").toLowerCase().indexOf(n) === 0; });
  if (prefix.length === 1) return prefix[0];
  var contains = active.filter(function (a) { return (a.name || "").toLowerCase().indexOf(n) !== -1; });
  if (contains.length === 1) return contains[0];
  return null;
}

function pickDate(text, label) {
  // "due: 2026-06-12" / "since: 2026-06-05" / "last: 2026-06-02" anywhere in the segment
  var m = text.match(new RegExp(label + ":?\\s*(\\d{4}-\\d{2}-\\d{2})", "i"));
  return m ? m[1] : null;
}

function stripDateTag(seg) {
  return seg.replace(/(due|since|last):?\s*\d{4}-\d{2}-\d{2}/gi, "").trim().replace(/[|·—–-]+\s*$/, "").trim();
}

export function parseDigest(text, accounts) {
  var rows = [];
  var unparsed = [];
  var digestDate = null;

  normalizeDigestText(text).split("\n").forEach(function (rawLine) {
    var line = rawLine.trim();
    if (!line) return;

    // Header/footer — capture the digest date, otherwise ignore.
    if (/^=+\s*FOLIOS DIGEST/i.test(line)) {
      var dm = line.match(/(\d{4}-\d{2}-\d{2})/);
      if (dm) digestDate = dm[1];
      return;
    }
    if (/^=+\s*END DIGEST/i.test(line)) return;

    var km = line.match(/^\[(OWE|WAITING|QUIET|TOUCH)\]\s*(.*)$/i);
    if (!km) { unparsed.push(line); return; }

    var kind = km[1].toUpperCase();
    var segs = km[2].split("|").map(function (p) { return p.trim(); }).filter(Boolean);
    if (segs.length === 0) { unparsed.push(line); return; }

    var accountName = segs[0];
    var account = matchAccount(accountName, accounts);
    var rest = segs.slice(1);
    var full = rest.join(" | ");

    if (kind === "OWE") {
      var what = stripDateTag(rest.join(" | "));
      if (!what) { unparsed.push(line); return; }
      rows.push({
        kind: "owe",
        accountName: accountName,
        accountId: account ? account.id : null,
        text: what,
        due: pickDate(full, "due"),
      });
    } else if (kind === "WAITING" || kind === "QUIET") {
      // [WAITING] acct | person | what | since: date — person optional for QUIET
      var who = rest.length >= 2 ? rest[0] : null;
      var whatSegs = rest.length >= 2 ? rest.slice(1) : rest;
      var what2 = stripDateTag(whatSegs.join(" — "));
      if (!what2 && !who) { unparsed.push(line); return; }
      rows.push({
        kind: kind === "WAITING" ? "waiting" : "quiet",
        accountName: accountName,
        accountId: account ? account.id : null,
        who: who ? stripDateTag(who) || null : null,
        text: what2 || ("Thread with " + who + " went quiet"),
        since: pickDate(full, "since") || pickDate(full, "last") || digestDate,
      });
    } else if (kind === "TOUCH") {
      var note = stripDateTag(rest.join(" — "));
      if (!note) { unparsed.push(line); return; }
      rows.push({
        kind: "touch",
        accountName: accountName,
        accountId: account ? account.id : null,
        text: note,
        date: pickDate(full, "last") || digestDate,
      });
    }
  });

  return { rows: rows, unparsed: unparsed, digestDate: digestDate };
}

export { KINDS };
