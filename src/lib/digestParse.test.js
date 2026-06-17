import { describe, it, expect } from "vitest";
import { parseDigest } from "./digestParse";

var ACCOUNTS = [
  { id: "a1", name: "Parts Authority" },
  { id: "a2", name: "All Star Auto Parts" },
  { id: "a3", name: "Keystone" },
  { id: "a4", name: "Keystone West", is_inactive: true },
];

describe("parseDigest", function () {
  it("parses a full digest with all four kinds", function () {
    var text = [
      "=== FOLIOS DIGEST · 2026-06-10 ===",
      "[OWE] Parts Authority | send the audit results | due: 2026-06-12",
      "[WAITING] All Star | Mike Reyes | the updated POC list | since: 2026-06-05",
      "[QUIET] Keystone | Dana | integration thread | last: 2026-06-02",
      "[TOUCH] Parts Authority | quick exchange about the regional expansion timing — positive",
      "=== END DIGEST ===",
    ].join("\n");
    var out = parseDigest(text, ACCOUNTS);
    expect(out.rows.length).toBe(4);
    expect(out.unparsed.length).toBe(0);
    expect(out.digestDate).toBe("2026-06-10");

    expect(out.rows[0]).toMatchObject({ kind: "owe", accountId: "a1", text: "send the audit results", due: "2026-06-12" });
    expect(out.rows[1]).toMatchObject({ kind: "waiting", accountId: "a2", who: "Mike Reyes", since: "2026-06-05" });
    expect(out.rows[2]).toMatchObject({ kind: "quiet", accountId: "a3", who: "Dana", since: "2026-06-02" });
    expect(out.rows[3].kind).toBe("touch");
    expect(out.rows[3].accountId).toBe("a1");
  });

  it("matches accounts by prefix and never matches inactive ones", function () {
    var out = parseDigest("[OWE] All Star | thing", ACCOUNTS);
    expect(out.rows[0].accountId).toBe("a2");
    // "Keystone" prefix-matches active a3 only (a4 inactive)
    var out2 = parseDigest("[OWE] Keystone | thing", ACCOUNTS);
    expect(out2.rows[0].accountId).toBe("a3");
  });

  it("leaves unknown accounts unresolved instead of guessing", function () {
    var out = parseDigest("[OWE] Some New Supplier | send pricing deck", ACCOUNTS);
    expect(out.rows[0].accountId).toBe(null);
    expect(out.rows[0].accountName).toBe("Some New Supplier");
  });

  it("collects unparsable lines instead of dropping them", function () {
    var out = parseDigest("random prose line\n[OWE] Parts Authority | do thing", ACCOUNTS);
    expect(out.unparsed).toEqual(["random prose line"]);
    expect(out.rows.length).toBe(1);
  });

  it("tolerates missing header, dates, and person on QUIET", function () {
    var out = parseDigest("[QUIET] Keystone | the renewal thread", ACCOUNTS);
    expect(out.rows[0]).toMatchObject({ kind: "quiet", who: null, text: "the renewal thread", since: null });
  });

  it("falls back to the digest date for WAITING rows without since:", function () {
    var text = "=== FOLIOS DIGEST · 2026-06-09 ===\n[WAITING] Keystone | Dana | the file";
    var out = parseDigest(text, ACCOUNTS);
    expect(out.rows[0].since).toBe("2026-06-09");
  });

  // ---- Parser v2: the friendly section-header format Sonnet actually emits ----
  var FRIENDLY = [
    { id: "d1", name: "Driven Brands" },
    { id: "p1", name: "Pacific Best" },
    { id: "c1", name: "Caliber" },
  ];

  it("parses the friendly section-header / dash-field format", function () {
    var text = [
      "Good, here's your recap for the day:",
      "Things I said I would do:",
      "Lindsay Klimek, Driven Brands - circle back with availability - promised same day (June 15)",
      "Justine, Pacific Best - sent over the June IPR - done June 16",
      "Things I'm waiting on:",
      "Gordon Lemmey, Driven Brands - explanation for the QCAP issue - tagged June 15, no reply",
      "Conversations that went quiet and need a nudge:",
      "Caliber - Brandon followed up, no resolution - last touched June 15",
      "Good conversations worth remembering:",
      "Lindsay Klimek, Driven Brands - solid back-and-forth, wants a monthly cadence",
    ].join("\n");
    var out = parseDigest(text, FRIENDLY);

    expect(out.rows.length).toBe(5);
    expect(out.unparsed).toContain("Good, here's your recap for the day:");

    var owe = out.rows.filter(function (r) { return r.kind === "owe"; });
    expect(owe.length).toBe(2);
    // "Person, Account" lead split correctly; natural date -> ISO (current year)
    expect(owe[0]).toMatchObject({ accountId: "d1", who: "Lindsay Klimek" });
    expect(owe[0].due).toBe(new Date().getFullYear() + "-06-15");
    // "done"/"sent" detected
    expect(owe[1]).toMatchObject({ accountId: "p1", who: "Justine", done: true });

    var waiting = out.rows.find(function (r) { return r.kind === "waiting"; });
    expect(waiting).toMatchObject({ accountId: "d1", who: "Gordon Lemmey" });
    expect(waiting.since).toBe(new Date().getFullYear() + "-06-15");

    // friendly QUIET: account-only lead, description must NOT become the person
    var quiet = out.rows.find(function (r) { return r.kind === "quiet"; });
    expect(quiet.accountId).toBe("c1");
    expect(quiet.who).toBe(null);

    var touch = out.rows.find(function (r) { return r.kind === "touch"; });
    expect(touch).toMatchObject({ accountId: "d1", who: "Lindsay Klimek" });
  });

  it("does not mistake prose for a section header", function () {
    // contains 'owe' substring (however) + 'would do' in a sentence, but it's long prose
    var text = "However I would do this differently next time and we should power through the lower-priority items together as a team";
    var out = parseDigest(text, FRIENDLY);
    expect(out.rows.length).toBe(0);
    expect(out.unparsed.length).toBe(1);
  });

  it("still parses strict bracket format unchanged", function () {
    var out = parseDigest("[WAITING] Caliber | Brandon | the fix | since: 2026-06-15", FRIENDLY);
    expect(out.rows[0]).toMatchObject({ kind: "waiting", accountId: "c1", who: "Brandon", since: "2026-06-15" });
  });
});
