export function normalizeSubject(raw) {
  if (!raw) return "";
  var s = String(raw);
  var prev;
  do {
    prev = s;
    s = s.replace(/^(re|fw|fwd|aw)\s*:\s*/i, "");
  } while (s !== prev);
  s = s.replace(/^\[[^\]]*\]\s*/g, "").replace(/^\([^)]*\)\s*/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[.,:;!?]+$/, "").trim();
  return s.toLowerCase();
}

export function tokenSetRatio(a, b) {
  if (!a || !b) return 0;
  var tokA = a.toLowerCase().split(/[\s\W]+/).filter(Boolean);
  var tokB = b.toLowerCase().split(/[\s\W]+/).filter(Boolean);
  var setA = new Set(tokA);
  var setB = new Set(tokB);
  var intersection = 0;
  setA.forEach(function (t) { if (setB.has(t)) intersection++; });
  var union = setA.size + setB.size - intersection;
  if (union === 0) return 1;
  return intersection / union;
}
