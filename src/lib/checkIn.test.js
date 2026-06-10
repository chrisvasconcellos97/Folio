import { describe, it, expect } from "vitest";
import { generateCheckInQuestions } from "./checkIn";

var TODAY = "2026-06-10";

describe("generateCheckInQuestions — deadline_passed", function () {
  it("asks about an open commitment whose due date just passed (the All Star class)", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      items: [{ id: "i1", text: "Send All Star the audit", due_date: "2026-06-08", is_commitment: true }],
    });
    expect(qs.length).toBe(1);
    expect(qs[0].kind).toBe("deadline_passed");
    expect(qs[0].targetId).toBe("i1");
    expect(qs[0].text).toContain("did it land");
  });

  it("ignores items done, undated, due in the future, or past the lookback window", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      items: [
        { id: "a", text: "done one",   due_date: "2026-06-08", done: true },
        { id: "b", text: "no date" },
        { id: "c", text: "future",     due_date: "2026-06-12" },
        { id: "d", text: "ancient",    due_date: "2026-05-01" },
        { id: "e", text: "due today",  due_date: "2026-06-10" },
      ],
    });
    expect(qs.length).toBe(0);
  });

  it("asks about a project whose expected date just passed", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      projects: [{ id: "p1", title: "All Star rebuild", expected_complete_date: "2026-06-07", status: "in_progress" }],
    });
    expect(qs.length).toBe(1);
    expect(qs[0].targetKind).toBe("project");
  });

  it("ranks commitments above plain items", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      items: [
        { id: "plain", text: "plain", due_date: "2026-06-09" },
        { id: "comm",  text: "promise", due_date: "2026-06-08", is_commitment: true },
      ],
    });
    expect(qs[0].targetId).toBe("comm");
  });
});

describe("generateCheckInQuestions — stalled_hold", function () {
  it("asks about a project held 7+ days, naming the holder", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      projects: [{ id: "p1", title: "Integration", status: "in_progress", waiting_on: "Danny", waiting_on_since: "2026-06-01" }],
    });
    expect(qs.length).toBe(1);
    expect(qs[0].kind).toBe("stalled_hold");
    expect(qs[0].who).toBe("Danny");
    expect(qs[0].text).toContain("9 days");
  });

  it("skips short holds and complete projects", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      projects: [
        { id: "p1", title: "Short", status: "in_progress", waiting_on: "Dana", waiting_on_since: "2026-06-07" },
        { id: "p2", title: "Done",  status: "complete",    waiting_on: "Dana", waiting_on_since: "2026-05-01" },
      ],
    });
    expect(qs.length).toBe(0);
  });
});

describe("generateCheckInQuestions — stale_draft + caps + answered", function () {
  it("asks about a 2+ day old draft, capped to one draft question", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      meetings: [
        { id: "m1", status: "draft", meeting_date: "2026-06-07", account_id: "a1" },
        { id: "m2", status: "draft", meeting_date: "2026-06-06" },
      ],
      accounts: [{ id: "a1", name: "Parts Authority" }],
    });
    expect(qs.length).toBe(1);
    expect(qs[0].kind).toBe("stale_draft");
    expect(qs[0].text).toContain("Parts Authority");
  });

  it("caps at 3 questions and prioritizes deadlines over holds over drafts", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      items: [
        { id: "i1", text: "one", due_date: "2026-06-09", is_commitment: true },
        { id: "i2", text: "two", due_date: "2026-06-08" },
      ],
      projects: [
        { id: "p1", title: "Held", status: "in_progress", waiting_on: "Danny", waiting_on_since: "2026-05-20" },
        { id: "p2", title: "Late", status: "in_progress", due_date: "2026-06-09" },
      ],
      meetings: [{ id: "m1", status: "draft", meeting_date: "2026-06-05" }],
    });
    expect(qs.length).toBe(3);
    expect(qs[0].kind).toBe("deadline_passed");
  });

  it("drops already-answered questions", function () {
    var qs = generateCheckInQuestions({
      todayISO: TODAY,
      items: [{ id: "i1", text: "promise", due_date: "2026-06-08", is_commitment: true }],
      answered: { "deadline_item_i1": "done" },
    });
    expect(qs.length).toBe(0);
  });
});
