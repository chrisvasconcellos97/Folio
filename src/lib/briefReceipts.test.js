import { describe, it, expect } from "vitest";
import { computeBriefReceipts, distinctiveToken } from "./briefReceipts";

describe("computeBriefReceipts", function () {
  it("credits a glossary term that appears in the brief", function () {
    var r = computeBriefReceipts("Confirm the OEC Costs billing question with Magdalena.", {
      glossary: [{ term: "OEC Costs" }, { term: "Fuse5" }],
    });
    expect(r).toContain("OEC Costs");
    expect(r).not.toContain("Fuse5"); // not present in the text
  });

  it("credits a glossary term via an alias appearing", function () {
    var r = computeBriefReceipts("The crash course slots haven't landed.", {
      glossary: [{ term: "OPS Crash Course", aliases: ["crash course"] }],
    });
    expect(r).toContain("OPS Crash Course");
  });

  it("credits a fact only when its distinctive token surfaces", function () {
    var present = computeBriefReceipts("Rusty has been the steady POC throughout.", {
      facts: ["Rusty is the primary point of contact at All Star"],
    });
    expect(present.length).toBe(1);
    var absent = computeBriefReceipts("The integration is running clean.", {
      facts: ["Rusty is the primary point of contact at All Star"],
    });
    expect(absent.length).toBe(0);
  });

  it("does NOT credit a fact on a coincidental common word", function () {
    // 'the'/'with' must never trigger attribution.
    var r = computeBriefReceipts("Touch base with the team about the rollout.", {
      facts: ["with the the the"],
    });
    expect(r.length).toBe(0);
  });

  it("dedups and caps at max", function () {
    var r = computeBriefReceipts("alpha beta gamma delta epsilon", {
      glossary: [{ term: "alpha" }, { term: "alpha" }, { term: "beta" }, { term: "gamma" }, { term: "delta" }, { term: "epsilon" }],
      max: 3,
    });
    expect(r.length).toBe(3);
    expect(new Set(r).size).toBe(3);
  });

  it("returns [] for empty/blank brief text", function () {
    expect(computeBriefReceipts("", { glossary: [{ term: "x" }] })).toEqual([]);
    expect(computeBriefReceipts("   ", { facts: ["Rusty here"] })).toEqual([]);
  });

  it("is safe with no inputs", function () {
    expect(computeBriefReceipts("some brief text", {})).toEqual([]);
    expect(computeBriefReceipts("some brief text")).toEqual([]);
  });
});

describe("distinctiveToken", function () {
  it("prefers a capitalized proper-noun-ish word", function () {
    expect(distinctiveToken("Rusty is the POC")).toBe("Rusty");
  });
  it("falls back to the longest word when nothing is capitalized", function () {
    expect(distinctiveToken("waiting on integration status")).toBe("integration");
  });
  it("returns '' when nothing qualifies", function () {
    expect(distinctiveToken("a in on at")).toBe("");
  });
});
