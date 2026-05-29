// Financial/revenue helpers were ripped during the Personal Mode
// simplification (see CLAUDE.md "Ripped" section). DB columns stay, but no
// UI reads them. `pickV` survives because it's used across many non-financial
// insight builders (Pip riffs, copy variants on Meetings/Cadence/Items/etc.)
// — it's a generic deterministic-variant helper that just happened to live
// in this file. Schema/DB columns left intact for future re-build.

export function pickV(seed, variants) {
  var hash = seed.split("").reduce(function (acc, c) { return (acc * 31 + c.charCodeAt(0)) | 0; }, 0);
  return variants[Math.abs(hash) % variants.length];
}
