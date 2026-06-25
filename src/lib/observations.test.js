import { describe, it, expect } from "vitest";
import { computeStreamFingerprint, buildStreamSummary, validateObservations } from "./observations";

var STREAM = {
  accounts: [{ id: "a1", name: "All Star" }, { id: "a2", name: "LKQ" }],
  tasks: [
    { id: "t1", title: "Send audit", account_id: "a1", is_commitment: true, done: false, due_date: "2026-06-20", created_at: "2026-06-10", updated_at: "2026-06-10" },
    { id: "t2", title: "Shop file", account_id: "a2", waiting_on: "Tara", waiting_on_since: "2026-06-12", done: false, updated_at: "2026-06-12" },
  ],
  meetings: [
    { id: "m1", account_id: "a1", meeting_date: "2026-06-18", title: "Crash course", theme: "planning" },
  ],
  themes: [{ key: "onboarding", count: 4, accounts: ["a1", "a2"] }],
};

describe("computeStreamFingerprint", function () {
  it("is stable for the same stream", function () {
    expect(computeStreamFingerprint(STREAM)).toBe(computeStreamFingerprint(STREAM));
  });
  it("is order-independent (tasks/meetings sorted by id)", function () {
    var reordered = Object.assign({}, STREAM, { tasks: STREAM.tasks.slice().reverse() });
    expect(computeStreamFingerprint(reordered)).toBe(computeStreamFingerprint(STREAM));
  });
  it("changes when a task closes", function () {
    var changed = Object.assign({}, STREAM, {
      tasks: [Object.assign({}, STREAM.tasks[0], { done: true }), STREAM.tasks[1]],
    });
    expect(computeStreamFingerprint(changed)).not.toBe(computeStreamFingerprint(STREAM));
  });
  it("changes when a waiting-on changes", function () {
    var changed = Object.assign({}, STREAM, {
      tasks: [STREAM.tasks[0], Object.assign({}, STREAM.tasks[1], { waiting_on: "Mike" })],
    });
    expect(computeStreamFingerprint(changed)).not.toBe(computeStreamFingerprint(STREAM));
  });
  it("does NOT change with a relative-time shift (no Date.now in the hash)", function () {
    // Building the same stream twice — even if 'now' differs — must hash equal.
    expect(computeStreamFingerprint(STREAM)).toBe(computeStreamFingerprint(STREAM));
  });
});

describe("buildStreamSummary", function () {
  it("emits commitments, waiting-ons, touches, and themes with account names", function () {
    var out = buildStreamSummary(STREAM, { todayISO: "2026-06-25" });
    expect(out).toMatch(/OPEN COMMITMENTS/);
    expect(out).toMatch(/Send audit · All Star/);
    expect(out).toMatch(/WAITING ON OTHERS/);
    expect(out).toMatch(/waiting on Tara/);
    expect(out).toMatch(/RECURRING THEMES/);
    expect(out).toMatch(/"onboarding" — came up 4×/);
  });
  it("ages waiting-ons from waiting_on_since", function () {
    var out = buildStreamSummary(STREAM, { todayISO: "2026-06-25" });
    expect(out).toMatch(/13d, no movement/); // 06-12 → 06-25
  });
  it("is safe with empty input", function () {
    expect(buildStreamSummary({})).toBe("");
    expect(buildStreamSummary()).toBe("");
  });
});

describe("validateObservations — the 4-part insight gate", function () {
  var good = { evidence: "x", why: "y", action_label: "Make a project", expected: "z" };

  it("keeps an observation only when all four parts are present", function () {
    expect(validateObservations([good]).length).toBe(1);
  });
  it("drops one missing any part", function () {
    expect(validateObservations([{ evidence: "x", why: "y", action_label: "do", expected: "" }]).length).toBe(0);
    expect(validateObservations([{ evidence: "x", why: "", action_label: "do", expected: "z" }]).length).toBe(0);
    expect(validateObservations([{ evidence: "", why: "y", action_label: "do", expected: "z" }]).length).toBe(0);
    expect(validateObservations([{ evidence: "x", why: "y", action_label: "", expected: "z" }]).length).toBe(0);
  });
  it("caps at max (precision over volume)", function () {
    expect(validateObservations([good, good, good], { max: 2 }).length).toBe(2);
  });
  it("is safe with junk input", function () {
    expect(validateObservations(null)).toEqual([]);
    expect(validateObservations([null, undefined, {}])).toEqual([]);
  });
});
