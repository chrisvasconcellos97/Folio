import { describe, it, expect } from "vitest";
import { validateNarrative, renderNarrativeBlock, parseNarrativeResponse, NARRATIVE_TRAJECTORIES } from "./accountNarrative";

var FULL = {
  arc: "Started at the Classic Collision integration; strong early, then slowed on product-team delays.",
  standing: "Re-engaged after the June rollout; Rusty is the active POC.",
  hinges_on: "Whether onboarding for the new shops actually lands this month.",
  trajectory: "warming",
  trajectory_why: "two productive calls in two weeks after a quiet stretch",
  as_of: "2026-06-20",
};

describe("validateNarrative", function () {
  it("passes a full, well-formed narrative through cleanly", function () {
    var n = validateNarrative(FULL);
    expect(n.standing).toBe(FULL.standing);
    expect(n.trajectory).toBe("warming");
    expect(n.as_of).toBe("2026-06-20");
  });

  it("returns null when the core `standing` field is missing (no story)", function () {
    expect(validateNarrative({ arc: "x", trajectory: "warming" })).toBe(null);
    expect(validateNarrative({ standing: "   " })).toBe(null);
    expect(validateNarrative(null)).toBe(null);
    expect(validateNarrative("nope")).toBe(null);
  });

  it("defaults an unknown trajectory to steady", function () {
    expect(validateNarrative({ standing: "ok", trajectory: "exploding" }).trajectory).toBe("steady");
    expect(validateNarrative({ standing: "ok" }).trajectory).toBe("steady");
    // sanity: the three real values are accepted verbatim
    Object.keys(NARRATIVE_TRAJECTORIES).forEach(function (t) {
      expect(validateNarrative({ standing: "ok", trajectory: t }).trajectory).toBe(t);
    });
  });

  it("drops a malformed as_of (must be YYYY-MM-DD)", function () {
    expect(validateNarrative({ standing: "ok", as_of: "yesterday" }).as_of).toBe(null);
    expect(validateNarrative({ standing: "ok", as_of: "2026-06-20" }).as_of).toBe("2026-06-20");
  });

  it("clamps over-long fields and normalizes whitespace", function () {
    var long = "x".repeat(1000);
    var n = validateNarrative({ standing: long });
    expect(n.standing.length).toBeLessThanOrEqual(400);
    expect(validateNarrative({ standing: "a\n\n  b   c" }).standing).toBe("a b c");
  });
});

describe("renderNarrativeBlock", function () {
  it("renders the 4-part story with the as-of date for staleness honesty", function () {
    var out = renderNarrativeBlock(FULL);
    expect(out).toContain("ACCOUNT STORY");
    expect(out).toContain("as of 2026-06-20");
    expect(out).toContain("How it got here:");
    expect(out).toContain("Where it stands:");
    expect(out).toContain("Hinges on:");
    expect(out).toContain("Trajectory: Warming — ");
  });

  it("returns '' for an unusable narrative so the section omits", function () {
    expect(renderNarrativeBlock(null)).toBe("");
    expect(renderNarrativeBlock({ arc: "no standing field" })).toBe("");
  });
});

describe("parseNarrativeResponse", function () {
  it("parses clean JSON", function () {
    var n = parseNarrativeResponse(JSON.stringify(FULL));
    expect(n.standing).toBe(FULL.standing);
    expect(n.trajectory).toBe("warming");
  });
  it("strips code fences", function () {
    var n = parseNarrativeResponse("```json\n" + JSON.stringify(FULL) + "\n```");
    expect(n).not.toBe(null);
    expect(n.standing).toBe(FULL.standing);
  });
  it("salvages JSON wrapped in prose", function () {
    var n = parseNarrativeResponse("Here you go:\n" + JSON.stringify(FULL) + "\nHope that helps!");
    expect(n).not.toBe(null);
    expect(n.hinges_on).toBe(FULL.hinges_on);
  });
  it("returns null on junk or a story missing `standing`", function () {
    expect(parseNarrativeResponse("not json at all")).toBe(null);
    expect(parseNarrativeResponse("")).toBe(null);
    expect(parseNarrativeResponse(JSON.stringify({ arc: "x", trajectory: "warming" }))).toBe(null);
  });

  it("omits optional lines but always shows standing + trajectory", function () {
    var out = renderNarrativeBlock({ standing: "Where it is.", trajectory: "cooling" });
    expect(out).toContain("Where it stands: Where it is.");
    expect(out).toContain("Trajectory: Cooling");
    expect(out).not.toContain("How it got here:");
    expect(out).not.toContain("Hinges on:");
  });
});
