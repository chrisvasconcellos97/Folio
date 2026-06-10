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
});
