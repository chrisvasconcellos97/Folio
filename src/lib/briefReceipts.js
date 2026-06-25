// Brief receipts — "✦ Pip used: …" attribution for a Pip-generated brief.
//
// The point (Felt-Intelligence Rule #4): when Pip draws on something Chris TAUGHT
// it — a glossary term, a fact he answered into Teach-Pip — the surface should
// SHOW it, so feeding Pip visibly pays off and the habit sticks.
//
// HONEST BY CONSTRUCTION: we only credit an input that LITERALLY appears in the
// brief text — never merely "was in the prompt." A receipt you can't see in the
// output is a lie, and a wrong receipt erodes the exact trust it's meant to build.

function trunc(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

// The most distinctive token in a short user-authored fact — a proper-noun-ish
// capitalized word if there is one (usually the name/entity the fact is about),
// else the longest word. Used to decide whether a fact surfaced in the brief
// WITHOUT crediting it just because a common word ("the", "with") coincides.
export function distinctiveToken(s) {
  var words = String(s || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  var caps = words.filter(function (w) { return /^[A-Z][a-z]/.test(w) && w.length >= 4; });
  var pool = caps.length ? caps : words.filter(function (w) { return w.length >= 5; });
  pool.sort(function (a, b) { return b.length - a.length; });
  return pool[0] || "";
}

// Returns up to `max` short labels for the taught inputs that appear in `text`.
// opts.glossary: array of { term, aliases? } (or bare term strings).
// opts.facts:    array of fact strings.
export function computeBriefReceipts(text, opts) {
  opts = opts || {};
  var max = opts.max || 4;
  var hay = String(text || "").toLowerCase();
  if (!hay.trim()) return [];

  var out = [];
  var seen = {};
  function push(label) {
    var key = label.toLowerCase();
    if (seen[key] || !label) return;
    seen[key] = true;
    out.push(label);
  }

  // Glossary terms (+ aliases): credit the canonical term when the term or any
  // alias appears in the brief.
  (Array.isArray(opts.glossary) ? opts.glossary : []).forEach(function (g) {
    if (out.length >= max) return;
    var term = g && (g.term != null ? g.term : (typeof g === "string" ? g : ""));
    term = String(term || "").trim();
    if (!term) return;
    var forms = [term].concat(Array.isArray(g && g.aliases) ? g.aliases : []);
    var hit = forms.some(function (f) {
      f = String(f || "").trim().toLowerCase();
      return f.length >= 2 && hay.indexOf(f) !== -1;
    });
    if (hit) push(term);
  });

  // Facts: credit a fact only when its distinctive token surfaces in the brief.
  (Array.isArray(opts.facts) ? opts.facts : []).forEach(function (f) {
    if (out.length >= max) return;
    var fact = String(f || "").trim();
    if (!fact) return;
    var key = distinctiveToken(fact);
    if (key && key.length >= 4 && hay.indexOf(key.toLowerCase()) !== -1) {
      push(trunc(fact, 48));
    }
  });

  return out.slice(0, max);
}
