// Email/Teams Digest Handoff (Game Plan Phase 1.3) — the two-brain bridge.
//
// Work Claude (corporate side) analyzes the inbox and emits a sanitized digest;
// Folios parses it deterministically — no AI call, no numbers. TWO input shapes
// are accepted (parser v2, 2026-06-17):
//
// 1) STRICT (machine) — tags + pipes, dates labeled:
//   [OWE] Account | what I committed to | due: 2026-06-12
//   [WAITING] Account | Person | what they owe me | since: 2026-06-05
//   [QUIET] Account | Person | thread that went quiet | last: 2026-06-02
//   [TOUCH] Account | one-line note
//
// 2) FRIENDLY (what Sonnet actually emits) — section headers + dash fields,
//    "Person, Account" lead, natural dates:
//   Things I said I would do:
//   Lindsay Klimek, Driven Brands - circle back with availability - promised (June 15)
//   Things I'm waiting on:
//   Gordon Lemmey, OEC - explanation for the QCAP issue - tagged June 15, no reply
//   Conversations that went quiet and need a nudge:
//   Caliber - Brandon followed up, no resolution - last touched June 15
//   Good conversations worth remembering:
//   Chris Bull, J 800 Radiator - stolen-car win, flagged as added value
//
// Lines that don't parse come back in `unparsed` so the preview shows them
// instead of silently dropping anything. The account-match + manual picker in
// DigestIngestModal handles leads that don't resolve to a known account.

var KINDS = ["OWE", "WAITING", "QUIET", "TOUCH"];

var MONTH_IDX = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Teams/Outlook paste mangles ASCII punctuation into Unicode lookalikes —
// curly quotes, fancy brackets, en/em dashes around the pipe — which silently
// broke the [TAG] regex and the segment splitter. Normalize to ASCII first.
function normalizeDigestText(text) {
  return (text || "")
    .replace(/[‘’‚‛]/g, "'")   // ' ' ‚ ‛ -> '
    .replace(/[“”„‟]/g, '"')   // " " „ ‟ -> "
    .replace(/[［【⟦❲]/g, "[")    // fancy [ -> [
    .replace(/[］】⟧❳]/g, "]")    // fancy ] -> ]
    .replace(/[｜│]/g, "|");               // fancy pipe -> |
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

// "Person, Account" (friendly) OR just "Account" (strict) lead field. Tries to
// resolve a known account from the whole field, then from each comma part; the
// non-account parts become the person. If nothing matches, assumes the LAST
// comma part is the account-ish name (so it lands in the manual picker) and the
// earlier parts are the person.
function splitPersonAccount(field, accounts) {
  var f = (field || "").trim();
  if (!f) return { account: null, accountName: "", person: null };
  var whole = matchAccount(f, accounts);
  if (whole) return { account: whole, accountName: f, person: null };
  var parts = f.split(",").map(function (p) { return p.trim(); }).filter(Boolean);
  for (var i = 0; i < parts.length; i++) {
    var m = matchAccount(parts[i], accounts);
    if (m) {
      var others = parts.filter(function (_, j) { return j !== i; });
      return { account: m, accountName: parts[i], person: others.join(", ") || null };
    }
  }
  if (parts.length >= 2) {
    return { account: null, accountName: parts[parts.length - 1], person: parts.slice(0, -1).join(", ") };
  }
  return { account: null, accountName: f, person: null };
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

// Labeled ISO ("due: 2026-06-12") first, else any ISO, else natural "June 15" /
// "(Jun 15)" -> ISO using the current year. Returns null if no date found.
function parseAnyDate(text, label) {
  if (!text) return null;
  if (label) {
    var lm = text.match(new RegExp(label + ":?\\s*(\\d{4}-\\d{2}-\\d{2})", "i"));
    if (lm) return lm[1];
  }
  var iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  var nm = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (nm) {
    var mo = MONTH_IDX[nm[1].slice(0, 3).toLowerCase()];
    var day = parseInt(nm[2], 10);
    if (mo && day >= 1 && day <= 31) {
      return new Date().getFullYear() + "-" + pad2(mo) + "-" + pad2(day);
    }
  }
  return null;
}

// Clean an item's display text: drop labeled dates, ISO dates, "(Month DD)"
// parentheticals, trailing "Month DD", and trailing separators.
function cleanText(seg) {
  return (seg || "")
    .replace(/(due|since|last):?\s*\d{4}-\d{2}-\d{2}/gi, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\)/gi, "")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi, "")
    .replace(/[|·—–\-\s]+$/, "")
    .trim();
}

// Section header -> kind, or null. Guarded: headers are short and have no
// " - " field separators, so item lines never trip them.
function headerKind(line) {
  if (/\s[-–—|]\s/.test(line)) return null;       // has field separators -> it's an item
  if (line.length > 70) return null;
  var l = line.toLowerCase().replace(/[:#*•]/g, " ").replace(/\s+/g, " ").trim();
  if (/things i .*\bdo\b|stuff i .*\bdo\b|i committed|\bi owe\b/.test(l)) return "OWE";
  if (/waiting (on|for)\b|i.?m waiting/.test(l)) return "WAITING";
  if (/went quiet|gone (quiet|cold)|need a nudge/.test(l)) return "QUIET";
  if (/worth remembering|good conversations?\b|notable conversations?\b|touchpoints?\b/.test(l)) return "TOUCH";
  return null;
}

function stripBullet(line) {
  return line.replace(/^\s*[-*•·]\s+/, "").trim();
}

// Split an item's fields: pipes if present (strict), else spaced dashes (friendly).
function splitFields(body) {
  if (body.indexOf("|") !== -1) {
    return body.split("|").map(function (p) { return p.trim(); }).filter(Boolean);
  }
  return body.split(/\s+[-–—]\s+/).map(function (p) { return p.trim(); }).filter(Boolean);
}

var DONE_RE = /\b(done|sent|completed?|finished|delivered|wrapped up)\b/i;

export function parseDigest(text, accounts) {
  var rows = [];
  var unparsed = [];
  var digestDate = null;
  var currentKind = null;

  normalizeDigestText(text).split("\n").forEach(function (rawLine) {
    var line = rawLine.trim();
    if (!line) return;

    // Optional Folios header/footer — capture the digest date.
    if (/^=+\s*FOLIOS DIGEST/i.test(line)) {
      var dm = line.match(/(\d{4}-\d{2}-\d{2})/);
      if (dm) digestDate = dm[1];
      return;
    }
    if (/^=+\s*END DIGEST/i.test(line)) return;

    // Explicit [TAG] (strict) wins regardless of section.
    var km = line.match(/^\[(OWE|WAITING|QUIET|TOUCH)\]\s*(.*)$/i);
    var kind = null;
    var body = null;
    if (km) {
      kind = km[1].toUpperCase();
      body = km[2];
    } else {
      // Friendly: is this a section header?
      var hk = headerKind(line);
      if (hk) { currentKind = hk; return; }
      // An item under a section header.
      if (currentKind) {
        kind = currentKind;
        body = stripBullet(line);
      }
    }

    if (!kind || !body) { unparsed.push(line); return; }

    var hadPipes = body.indexOf("|") !== -1;
    var fields = splitFields(body);
    if (fields.length === 0) { unparsed.push(line); return; }

    var sa = splitPersonAccount(fields[0], accounts);
    var restFields = fields.slice(1);
    var person = sa.person;

    // STRICT shape only — [account | person | what | …]. When the lead gave no
    // person and the input was pipe-delimited, the 2nd field is the person.
    // FRIENDLY dash lines are [account - what - date] (person rides in the lead
    // as "Person, Account"), so this heuristic must NOT fire for them or it eats
    // the description as a person.
    if ((kind === "WAITING" || kind === "QUIET") && hadPipes && !person && restFields.length >= 2) {
      person = restFields[0];
      restFields = restFields.slice(1);
    }

    var full = body;
    var whatRaw = restFields.join(" — ");
    var what = cleanText(whatRaw);

    if (kind === "OWE") {
      if (!what) { unparsed.push(line); return; }
      rows.push({
        kind: "owe",
        accountName: sa.accountName,
        accountId: sa.account ? sa.account.id : null,
        who: person || null,
        text: what,
        due: parseAnyDate(full, "due"),
        done: DONE_RE.test(whatRaw),
      });
    } else if (kind === "WAITING" || kind === "QUIET") {
      if (!what && !person) { unparsed.push(line); return; }
      rows.push({
        kind: kind === "WAITING" ? "waiting" : "quiet",
        accountName: sa.accountName,
        accountId: sa.account ? sa.account.id : null,
        who: person ? (cleanText(person) || null) : null,
        text: what || ("Thread with " + person + " went quiet"),
        since: parseAnyDate(full, "since") || parseAnyDate(full, "last") || digestDate,
      });
    } else if (kind === "TOUCH") {
      if (!what) { unparsed.push(line); return; }
      rows.push({
        kind: "touch",
        accountName: sa.accountName,
        accountId: sa.account ? sa.account.id : null,
        who: person || null,
        text: what,
        date: parseAnyDate(full, "last") || digestDate,
      });
    }
  });

  return { rows: rows, unparsed: unparsed, digestDate: digestDate };
}

export { KINDS };
