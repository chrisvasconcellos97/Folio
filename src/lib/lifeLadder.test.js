import { describe, it, expect } from "vitest";
import { nextOccurrence, daysUntil, headsUp, upcomingItems, honeyDoSorted } from "./lifeLadder";

function makeDate(daysFromNow) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function today() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── nextOccurrence ─────────────────────────────────────────────────────

describe("nextOccurrence — one-off items", function () {
  it("returns the date when it is in the future", function () {
    var item = { item_date: makeDate(5), recurrence: null };
    var occ = nextOccurrence(item, today());
    expect(occ).not.toBeNull();
  });

  it("returns the date when it is today", function () {
    var item = { item_date: makeDate(0), recurrence: null };
    var occ = nextOccurrence(item, today());
    expect(occ).not.toBeNull();
  });

  it("returns null when the date is in the past", function () {
    var item = { item_date: makeDate(-1), recurrence: null };
    var occ = nextOccurrence(item, today());
    expect(occ).toBeNull();
  });

  it("returns null when no date is set", function () {
    var item = { item_date: null };
    expect(nextOccurrence(item, today())).toBeNull();
  });
});

describe("nextOccurrence — annual recurrence", function () {
  it("uses this year's date when it has not passed yet", function () {
    var item = { item_date: makeDate(10), recurrence: "annual" };
    var occ = nextOccurrence(item, today());
    expect(occ).not.toBeNull();
    var d = daysUntil(item, today());
    expect(d).toBeGreaterThanOrEqual(9);
    expect(d).toBeLessThanOrEqual(11);
  });

  it("rolls forward to next year when this year's date has passed", function () {
    var item = { item_date: makeDate(-5), recurrence: "annual" };
    var d = daysUntil(item, today());
    // Should be ~360 days from now, not -5
    expect(d).toBeGreaterThan(300);
  });
});

// ── daysUntil ─────────────────────────────────────────────────────────

describe("daysUntil", function () {
  it("returns 0 for today", function () {
    var item = { item_date: makeDate(0), recurrence: null };
    expect(daysUntil(item, today())).toBe(0);
  });

  it("returns correct count for a future date", function () {
    var item = { item_date: makeDate(7), recurrence: null };
    expect(daysUntil(item, today())).toBe(7);
  });

  it("returns null for a past one-off item", function () {
    var item = { item_date: makeDate(-3), recurrence: null };
    expect(daysUntil(item, today())).toBeNull();
  });
});

// ── headsUp ───────────────────────────────────────────────────────────

describe("headsUp — key stages", function () {
  it("returns 'today' for d=0", function () {
    var item = { item_date: makeDate(0), recurrence: null, importance: "normal" };
    expect(headsUp(item, today()).key).toBe("today");
  });

  it("returns 'tomorrow' for d=1", function () {
    var item = { item_date: makeDate(1), recurrence: null, importance: "normal" };
    expect(headsUp(item, today()).key).toBe("tomorrow");
  });

  it("returns 'soon' for d=3 (non-VIP)", function () {
    var item = { item_date: makeDate(3), recurrence: null, importance: "normal" };
    expect(headsUp(item, today()).key).toBe("soon");
  });

  it("returns 'week' for d=7 (non-VIP)", function () {
    var item = { item_date: makeDate(7), recurrence: null, importance: "normal" };
    expect(headsUp(item, today()).key).toBe("week");
  });

  it("returns null for d=15 (non-VIP — too far out)", function () {
    var item = { item_date: makeDate(15), recurrence: null, importance: "normal" };
    expect(headsUp(item, today())).toBeNull();
  });

  it("returns 'early' for VIP item at d=20", function () {
    var item = { item_date: makeDate(20), recurrence: null, importance: "vip" };
    expect(headsUp(item, today()).key).toBe("early");
  });

  it("returns null for VIP item at d=30 (beyond ~3wk window)", function () {
    var item = { item_date: makeDate(30), recurrence: null, importance: "vip" };
    expect(headsUp(item, today())).toBeNull();
  });
});

// ── upcomingItems ─────────────────────────────────────────────────────

describe("upcomingItems", function () {
  it("includes appointments and events within horizon", function () {
    var items = [
      { kind: "appointment", status: "open", item_date: makeDate(5), recurrence: null },
      { kind: "event",       status: "open", item_date: makeDate(10), recurrence: null },
      { kind: "todo",        status: "open", item_date: makeDate(2), recurrence: null },
    ];
    var result = upcomingItems(items, 30);
    expect(result.length).toBe(2);
    expect(result[0].item.kind).toBe("appointment");
  });

  it("excludes done or archived items", function () {
    var items = [
      { kind: "appointment", status: "done",     item_date: makeDate(3), recurrence: null },
      { kind: "event",       status: "archived", item_date: makeDate(3), recurrence: null },
      { kind: "appointment", status: "open",     item_date: makeDate(3), recurrence: null },
    ];
    var result = upcomingItems(items, 30);
    expect(result.length).toBe(1);
  });

  it("sorts soonest first", function () {
    var items = [
      { kind: "event", status: "open", item_date: makeDate(10), recurrence: null },
      { kind: "event", status: "open", item_date: makeDate(2),  recurrence: null },
    ];
    var result = upcomingItems(items, 30);
    expect(result[0].daysUntil).toBeLessThan(result[1].daysUntil);
  });
});

// ── honeyDoSorted ─────────────────────────────────────────────────────

describe("honeyDoSorted", function () {
  var old    = new Date(Date.now() - 30 * 86400000).toISOString();
  var recent = new Date(Date.now() - 2  * 86400000).toISOString();

  it("only returns todo items that are not done or archived", function () {
    var items = [
      { kind: "todo", status: "open",     opened_at: recent, complexity: "small" },
      { kind: "todo", status: "done",     opened_at: recent, complexity: "big" },
      { kind: "event", status: "open",    opened_at: recent, complexity: "big" },
    ];
    var result = honeyDoSorted(items);
    expect(result.length).toBe(1);
  });

  it("big+old scores higher than small+new", function () {
    var items = [
      { kind: "todo", status: "open", opened_at: recent, complexity: "small" },
      { kind: "todo", status: "open", opened_at: old,    complexity: "big"   },
    ];
    var result = honeyDoSorted(items);
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[0].item.complexity).toBe("big");
  });

  it("ageDays is reasonable", function () {
    var items = [{ kind: "todo", status: "open", opened_at: old, complexity: "medium" }];
    var result = honeyDoSorted(items);
    expect(result[0].ageDays).toBeGreaterThanOrEqual(29);
    expect(result[0].ageDays).toBeLessThanOrEqual(32);
  });
});
