import { describe, it, expect } from "vitest";
import { computeAccountHealth, gatherSignals } from "./accountHealth";

// ── computeAccountHealth ───────────────────────────────────────────────

describe("computeAccountHealth — override", function () {
  it("returns the override status when set and not expired", function () {
    var acct = { status_override: "red", status_override_reason: "contract risk", status_override_until: "2099-12-31" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 30 });
    expect(result.status).toBe("red");
    expect(result.pinned).toBe(true);
  });

  it("ignores an expired override and re-computes health", function () {
    var acct = { tier: "Growth", status_override: "red", status_override_until: "2020-01-01" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 30 });
    expect(result.status).toBe("green");
    expect(result.pinned).toBe(false);
  });
});

describe("computeAccountHealth — new accounts", function () {
  it("returns 'new' status when account is < 7 days old and never touched", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: null, accountAgeDays: 3 });
    expect(result.status).toBe("new");
  });

  it("does NOT return 'new' if the account has been touched", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 3 });
    expect(result.status).toBe("green");
  });
});

describe("computeAccountHealth — tier-aware cold thresholds", function () {
  function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString();
  }

  it("Major tier: 31+ days cold → red", function () {
    var acct = { tier: "Major" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: daysAgo(31), accountAgeDays: 100 });
    expect(result.status).toBe("red");
  });

  it("Major tier: 15 days cold → yellow", function () {
    var acct = { tier: "Major" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: daysAgo(15), accountAgeDays: 100 });
    expect(result.status).toBe("yellow");
  });

  it("Growth tier: 31 days cold → yellow (not red)", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: daysAgo(31), accountAgeDays: 100 });
    expect(result.status).toBe("yellow");
  });

  it("Growth tier: 61+ days cold → red", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: daysAgo(61), accountAgeDays: 100 });
    expect(result.status).toBe("red");
  });
});

describe("computeAccountHealth — blockers and overdue", function () {
  it("blocked project → red regardless of cold days", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 1, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 100 });
    expect(result.status).toBe("red");
  });

  it("Growth: 1 overdue item → yellow", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 1, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 100 });
    expect(result.status).toBe("yellow");
  });

  it("Growth: 4 overdue items → red", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 4, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 100 });
    expect(result.status).toBe("red");
  });

  it("on-hold project → yellow", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, onHoldProjects: 1, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 100 });
    expect(result.status).toBe("yellow");
  });

  it("healthy account → green", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 100 });
    expect(result.status).toBe("green");
  });
});

describe("computeAccountHealth — explainable reasons", function () {
  function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

  it("collects EVERY contributing factor, not just the first", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, {
      openItemsOverdue: 5, blockedProjects: 1, onHoldProjects: 2, missedCadences: 0,
      lastInteractionAt: daysAgo(61), accountAgeDays: 100,
    });
    expect(result.status).toBe("red");
    expect(Array.isArray(result.reasons)).toBe(true);
    // cold + blocked + overdue + on-hold all present
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    expect(result.reasons.join(" · ")).toMatch(/no substantive contact/);
    expect(result.reasons.join(" · ")).toMatch(/blocked/);
    expect(result.reasons.join(" · ")).toMatch(/overdue/);
    expect(result.reasons.join(" · ")).toMatch(/on hold/);
  });

  it("primary reason stays first (cold before overdue)", function () {
    var acct = { tier: "Growth" };
    var result = computeAccountHealth(acct, {
      openItemsOverdue: 4, blockedProjects: 0, missedCadences: 0,
      lastInteractionAt: daysAgo(61), accountAgeDays: 100,
    });
    expect(result.reason).toMatch(/no substantive contact/);
    expect(result.reason).toBe(result.reasons[0]);
  });

  it("green account → reasons is ['on track']", function () {
    var result = computeAccountHealth({ tier: "Growth" }, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 100 });
    expect(result.reasons).toEqual(["on track"]);
  });

  it("override carries its reason into reasons[]", function () {
    var acct = { status_override: "red", status_override_reason: "contract risk", status_override_until: "2099-12-31" };
    var result = computeAccountHealth(acct, { openItemsOverdue: 0, blockedProjects: 0, missedCadences: 0, lastInteractionAt: new Date().toISOString(), accountAgeDays: 100 });
    expect(result.reasons).toEqual(["contract risk"]);
  });
});

// ── gatherSignals ──────────────────────────────────────────────────────

describe("gatherSignals", function () {
  var todayISO = new Date().toISOString().slice(0, 10);
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  it("counts overdue items correctly", function () {
    var account = { id: "a1", last_interaction_at: null, created_at: new Date(Date.now() - 30 * 86400000).toISOString() };
    var items = [
      { account_id: "a1", done: false, due_date: yesterday },
      { account_id: "a1", done: false, due_date: yesterday },
      { account_id: "a1", done: false, due_date: null },
      { account_id: "a1", done: true,  due_date: yesterday },
    ];
    var sig = gatherSignals(account, items, [], todayISO);
    expect(sig.openItemsOverdue).toBe(2);
    expect(sig.openItemsAll).toBe(3);
  });

  it("counts blocked and on_hold projects", function () {
    var account = { id: "a1", last_interaction_at: null, created_at: new Date(Date.now() - 30 * 86400000).toISOString() };
    var projects = [
      { id: "p1", account_id: "a1", account_ids: [], status: "blocked" },
      { id: "p2", account_id: "a1", account_ids: [], status: "on_hold" },
      { id: "p3", account_id: "a1", account_ids: [], status: "in_progress" },
    ];
    var sig = gatherSignals(account, [], projects, todayISO);
    expect(sig.blockedProjects).toBe(1);
    expect(sig.onHoldProjects).toBe(1);
  });

  it("reports 'new' accountAgeDays for a newly created account", function () {
    var now = new Date().toISOString();
    var account = { id: "a1", last_interaction_at: null, created_at: now };
    var sig = gatherSignals(account, [], [], todayISO);
    expect(sig.accountAgeDays).toBeLessThan(2);
  });

  it("ignores items from other accounts", function () {
    var account = { id: "a1", last_interaction_at: null, created_at: new Date(Date.now() - 30 * 86400000).toISOString() };
    var items = [{ account_id: "a2", done: false, due_date: yesterday }];
    var sig = gatherSignals(account, items, [], todayISO);
    expect(sig.openItemsOverdue).toBe(0);
  });
});
