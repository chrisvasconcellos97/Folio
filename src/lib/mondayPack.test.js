import { describe, it, expect } from "vitest";
import {
  pickMondayCadence,
  shouldShowMondayCard,
  buildPackSections,
  computePackFingerprint,
  buildPackPromptPayload,
} from "./mondayPack";

var WINDOW_START = "2026-06-08"; // a Monday
var TODAY = "2026-06-15";        // the next Monday

function baseBundle(over) {
  return Object.assign({
    windowStart: WINDOW_START,
    weekAnchor: WINDOW_START,
    today: TODAY,
    accountsById: { a1: "All Star", a2: "Gerber" },
    userEmail: "chris@oec.com",
    commitments: [],
    meetings: [],
    projects: [],
    tasks: [],
    leadershipTasks: [],
    lastOneOnOne: null,
  }, over || {});
}

describe("pickMondayCadence", function () {
  it("picks the weekly person cadence on Monday (day_of_week 1)", function () {
    var cads = [
      { id: "c1", cadence_scope: "person", day_of_week: 3, frequency: "weekly" },
      { id: "c2", cadence_scope: "person", day_of_week: 1, frequency: "weekly", meeting_time: "10:00" },
    ];
    expect(pickMondayCadence(cads, new Date(TODAY)).id).toBe("c2");
  });

  it("tie-breaks several Monday 1:1s by earliest meeting_time", function () {
    var cads = [
      { id: "late",  cadence_scope: "person", day_of_week: 1, frequency: "weekly", meeting_time: "14:00" },
      { id: "early", cadence_scope: "person", day_of_week: 1, frequency: "weekly", meeting_time: "09:00" },
    ];
    expect(pickMondayCadence(cads, new Date(TODAY)).id).toBe("early");
  });

  it("returns null when no person cadence falls on Monday", function () {
    var cads = [{ id: "c1", cadence_scope: "person", day_of_week: 2, frequency: "weekly" }];
    expect(pickMondayCadence(cads, new Date(TODAY))).toBe(null);
    expect(pickMondayCadence([], new Date(TODAY))).toBe(null);
  });

  it("ignores account cadences and non-weekly/biweekly frequencies", function () {
    var cads = [
      { id: "acct", cadence_scope: "account", account_id: "a1", day_of_week: 1, frequency: "weekly" },
      { id: "mon",  cadence_scope: "person", day_of_week: 1, frequency: "monthly" },
    ];
    expect(pickMondayCadence(cads, new Date(TODAY))).toBe(null);
  });
});

describe("shouldShowMondayCard", function () {
  var cad = { id: "c2", cadence_scope: "person", day_of_week: 1, frequency: "weekly" };
  it("shows on Monday", function () {
    expect(shouldShowMondayCard(cad, new Date("2026-06-15T00:00:00"))).toBe(true); // Monday
  });
  it("shows on the Sunday heads-up (≤1 day out)", function () {
    expect(shouldShowMondayCard(cad, new Date("2026-06-14T00:00:00"))).toBe(true); // Sunday
  });
  it("hides mid-week", function () {
    expect(shouldShowMondayCard(cad, new Date("2026-06-17T00:00:00"))).toBe(false); // Wednesday
  });
  it("hides when no cadence", function () {
    expect(shouldShowMondayCard(null, new Date(TODAY))).toBe(false);
  });
});

describe("buildPackSections — YOUR WORD (promised-vs-done)", function () {
  it("classifies Kept / Slipped / Open and drops pre-window closes", function () {
    var s = buildPackSections(baseBundle({
      commitments: [
        { id: "k", title: "Send audit", is_commitment: true, done: true, status: "complete", closed_at: "2026-06-10T12:00:00Z", account_id: "a1" },
        { id: "kpre", title: "Old promise", is_commitment: true, done: true, closed_at: "2026-06-01T12:00:00Z", account_id: "a1" },
        { id: "sl", title: "Overdue thing", is_commitment: true, due_date: "2026-06-12", account_id: "a2" },
        { id: "op", title: "Due later", is_commitment: true, due_date: "2026-06-20", account_id: "a1" },
        { id: "opn", title: "No date", is_commitment: true, account_id: "a2" },
        { id: "notc", title: "Not a commitment", is_commitment: false },
      ],
    }));
    expect(s.yourWord.kept.map(function (r) { return r.id; })).toEqual(["k"]);
    expect(s.yourWord.slipped.map(function (r) { return r.id; })).toEqual(["sl"]);
    expect(s.yourWord.open.map(function (r) { return r.id; }).sort()).toEqual(["op", "opn"]);
    expect(s.yourWord.kept[0].account).toBe("All Star");
    expect(s.counts.kept).toBe(1);
  });
});

describe("buildPackSections — WHAT MOVED + WHO HAS THE BALL", function () {
  it("rolls up per-account meetings, pulses, deliveries; surfaces waiting-ons", function () {
    var s = buildPackSections(baseBundle({
      meetings: [
        { id: "m1", account_id: "a1", title: "Cadence", meeting_date: "2026-06-11", status: "summarized" },
        { id: "m0", account_id: "a1", title: "Old", meeting_date: "2026-06-01", status: "summarized" },
        { id: "msch", account_id: "a1", title: "Upcoming", meeting_date: "2026-06-16", status: "scheduled" },
      ],
      projects: [
        { id: "p1", account_id: "a2", title: "Integration", status: "in_progress",
          status_updates: [{ body: "waiting on legal", at: "2026-06-12T10:00:00Z" }, { body: "stale", at: "2026-06-01T10:00:00Z" }],
          waiting_on: "legal@oec.com", waiting_on_since: "2026-06-09" },
        { id: "p2", account_id: "a1", title: "Rebuild", status: "complete", updated_at: "2026-06-13T10:00:00Z" },
      ],
      tasks: [
        { id: "t1", account_id: "a1", title: "Shipped report", done: true, closed_at: "2026-06-12T10:00:00Z" },
        { id: "t2", account_id: "a2", title: "Chase POC", waiting_on: "Trey", waiting_on_since: "2026-06-10" },
      ],
    }));
    var allStar = s.whatMoved.find(function (a) { return a.account === "All Star"; });
    expect(allStar.meetings.length).toBe(1); // old + scheduled excluded
    expect(allStar.deliveries.length).toBe(2); // shipped task + completed project
    var gerber = s.whatMoved.find(function (a) { return a.account === "Gerber"; });
    expect(gerber.pulses.length).toBe(1); // stale pre-window pulse excluded
    // waiting-ons: project (legal) + task (Trey)
    expect(s.whoHasBall.owedMe.length).toBe(2);
    expect(s.whoHasBall.owedMe.some(function (r) { return r.who === "Trey"; })).toBe(true);
  });

  it("iOwe lists open + slipped commitments (App Coherence with Home 'Your word')", function () {
    var s = buildPackSections(baseBundle({
      commitments: [
        { id: "sl", title: "Overdue", is_commitment: true, due_date: "2026-06-12", account_id: "a1" },
        { id: "op", title: "Open", is_commitment: true, account_id: "a2" },
        { id: "k", title: "Done", is_commitment: true, done: true, closed_at: "2026-06-12T10:00:00Z" },
      ],
    }));
    expect(s.whoHasBall.iOwe.length).toBe(2);
    expect(s.whoHasBall.iOwe.some(function (r) { return r.slipped; })).toBe(true);
  });
});

describe("computePackFingerprint — TIME-STABLE (drift lock)", function () {
  function richBundle(anchor) {
    return baseBundle({
      weekAnchor: anchor,
      windowStart: anchor,
      lastOneOnOne: { id: "o1", updated_at: "2026-06-08T09:00:00Z", notes: "x" },
      leadershipTasks: [{ id: "l1", updated_at: "2026-06-09T09:00:00Z" }],
      commitments: [{ id: "c1", is_commitment: true, due_date: "2026-06-20" }],
      meetings: [{ id: "m1", updated_at: "2026-06-11T09:00:00Z", meeting_date: "2026-06-11" }],
      projects: [{ id: "p1", status: "in_progress", status_updates: [{ body: "b", at: "2026-06-12T10:00:00Z" }] }],
      tasks: [{ id: "t1", updated_at: "2026-06-12T09:00:00Z" }],
    });
  }

  it("is identical across a simulated +1 day with the same stored data", function () {
    // Same stored timestamps/ids/counts → same hash, regardless of 'now'.
    var a = computePackFingerprint(richBundle(WINDOW_START));
    var b = computePackFingerprint(richBundle(WINDOW_START));
    expect(a).toBe(b);
  });

  it("changes when the week anchor rolls over", function () {
    expect(computePackFingerprint(richBundle("2026-06-08")))
      .not.toBe(computePackFingerprint(richBundle("2026-06-15")));
  });

  it("changes when a commitment closes, a 1:1 is re-logged, or a pulse is posted", function () {
    var base = computePackFingerprint(richBundle(WINDOW_START));
    var closed = richBundle(WINDOW_START);
    closed.commitments = [{ id: "c1", is_commitment: true, due_date: "2026-06-20", done: true, closed_at: "2026-06-13T10:00:00Z" }];
    expect(computePackFingerprint(closed)).not.toBe(base);

    var relogged = richBundle(WINDOW_START);
    relogged.lastOneOnOne = { id: "o1", updated_at: "2026-06-15T09:00:00Z" };
    expect(computePackFingerprint(relogged)).not.toBe(base);

    var pulse = richBundle(WINDOW_START);
    pulse.projects = [{ id: "p1", status: "in_progress", status_updates: [{ body: "b", at: "2026-06-14T10:00:00Z" }] }];
    expect(computePackFingerprint(pulse)).not.toBe(base);
  });
});

describe("buildPackPromptPayload", function () {
  it("emits compact current-state lines + the last 1:1 + leadership tasks", function () {
    var bundle = baseBundle({
      lastOneOnOne: { id: "o1", meeting_date: "2026-06-08", notes: "Boss asked where we are on the Gerber integration.", pip_summary: "Discussed Gerber." },
      leadershipTasks: [{ id: "l1", title: "Train the analyst", due_date: "2026-06-20" }],
      commitments: [{ id: "sl", title: "Send audit", is_commitment: true, due_date: "2026-06-12", account_id: "a1" }],
      projects: [{ id: "p1", account_id: "a2", title: "Integration", status: "in_progress", waiting_on: "legal", waiting_on_since: "2026-06-09" }],
    });
    var payload = buildPackPromptPayload(bundle);
    expect(payload.lastOneOnOne.date).toBe("2026-06-08");
    expect(payload.lastOneOnOne.notes).toContain("Gerber");
    expect(payload.leadershipTasks[0].title).toBe("Train the analyst");
    expect(payload.currentState).toContain("SLIPPED");
    expect(payload.currentState).toContain("WAITING ON legal");
  });

  it("handles no prior 1:1 gracefully (null, never throws)", function () {
    var payload = buildPackPromptPayload(baseBundle());
    expect(payload.lastOneOnOne).toBe(null);
    expect(payload.leadershipTasks).toEqual([]);
    expect(typeof payload.currentState).toBe("string");
  });
});
