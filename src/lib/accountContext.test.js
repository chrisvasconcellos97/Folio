import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAccountContext, renderAccountContext, computeContextFingerprint, recallSourceLabel } from "./accountContext";

// One fixed, richly-populated account bundle. Each surface renders from this
// SAME object; the assertions below are the drift lock — if a future change
// drops a field from a surface that should have it, a test here fails.
var ME = "user-1";
var THEM = "user-2";

function fixture() {
  return {
    id: "acc-1",
    name: "Parts Authority",
    account_type: "mso",
    tier: "Major",
    status: "active",
    health: "watching",
    last_interaction_at: "2026-05-01",
    owner_user_id: THEM, // owned by someone else → ownership note should fire
    status_override: "at_risk",
    status_override_reason: "exec escalation",
    serviced_states: ["NY", "NJ", "CT"],
    objective: "Grow shop coverage in the northeast.",
    narrative: {
      arc: "Began at the Classic Collision integration; slowed on product delays.",
      standing: "Re-engaged after the June rollout; Rusty is the active POC.",
      hinges_on: "Whether the new-shop onboarding lands this month.",
      trajectory: "cooling", trajectory_why: "two follow-ups slipped",
      as_of: "2026-06-20",
    },
    systems: [{ name: "Fuse5", note: "their DMS" }],
    meetings: [
      {
        date: "2026-04-12", title: "Q1 review",
        notes: "Long verbatim notes about the invoice feed and rollout plan.",
        summary: "Discussed Q1 numbers and the invoice feed delay.",
        action_items: "Send CAPA docs", follow_up: "2026-05-20",
        attendees: ["Adam", "Lisa"], theme: "integration", tone: "mixed",
        method: "Video",
        project_notes: [{ title: "Invoice feed", note: "Waiting on their IT to whitelist us." }],
      },
    ],
    scheduledMeetings: [
      { date: "2026-06-25", time: "10:00", method: "Video", agenda: "Integration kickoff" },
    ],
    openItems: [
      { text: "Send CAPA cert docs", due: "2020-04-22", is_commitment: true, owner: "me@oec.com" },
      { text: "Confirm rollout dates", waiting_on: "Adam", waiting_on_since: "2026-05-10" },
    ],
    contacts: [
      { name: "Adam Reynolds", title: "VP Sales", email: "adam@pa.com", is_poc: true, is_primary: true, relationship_role: "champion", relationship_note: "Our internal advocate." },
      { name: "Old Contact", title: "Buyer", relationship_role: "neutral" },
    ],
    activeProjects: [
      {
        title: "Continental migration", status: "in_progress", due_date: "2026-05-30",
        assignee: "dana@oec.com", requested_by: "boss@oec.com",
        waiting_on: "their IT", waiting_on_since: "2026-05-15",
        status_updates: [{ body: "Waiting on legal sign-off", at: "2026-05-18T00:00:00Z" }],
        tasks: [{ title: "Map SKUs", assignee_email: "dana@oec.com", recipient: "adam@pa.com" }],
      },
    ],
    recentUpdates: [
      { update_date: "2026-05-05", update_type: "pricing", title: "New matrix", description: "Rolled out new pricing matrix.", owner: "ops@oec.com", observed_impact: "volume up" },
    ],
    healthSnapshots: [
      { snapshot_date: "2026-04-28", health_status: "healthy", health_score: 80, days_since_contact: 2, open_item_count: 3, overdue_item_count: 0, active_project_count: 1 },
      { snapshot_date: "2026-04-29", health_status: "watching", health_score: 60 },
      { snapshot_date: "2026-04-30", health_status: "watching", health_score: 55 },
    ],
    promiseStats: { avgDays: 6, recentItems: [{ item_text: "Sent the audit file", days_to_complete: 4 }] },
    portfolioThemes: [{ theme: "pricing", count: 3, accounts: ["Parts Authority", "KSI"] }],
    operator_headline: "Drifting — no movement in 9 days.",
    operator_situation: "Follow-up overdue on the invoice feed commitment.",
    operator_risks: ["overdue commitment", "cooling tone"],
    operator_delta: "Two tasks closed since last run.",
  };
}

// Operator-run supplies a single snapshot row + an `operator` object + lessons,
// not the chat-shaped flat fields. Build the operator view of the same account.
function operatorFixture() {
  var a = fixture();
  a.snapshot = { health_status: "watching", health_score: 55, days_since_contact: 18, overdue_item_count: 1, active_project_count: 1 };
  a.healthSnapshots = []; // operator passes one snapshot, not the history array
  a.operator = { situation: "Follow-up overdue on the invoice feed commitment.", lessons_learned: "Route invoice work to Gauge, not standalone items." };
  return a;
}

describe("buildAccountContext — chat surface", function () {
  var text = renderAccountContext(fixture(), { surface: "chat", userId: ME });
  it("emits header, status, override, objective, systems", function () {
    expect(text).toMatch(/ACCOUNT: Parts Authority \[MSO\] \(id: acc-1\)/);
    expect(text).toMatch(/Status: active · Health: watching/);
    expect(text).toMatch(/Status override: at_risk \(exec escalation\)/);
    expect(text).toMatch(/Account Intel: Grow shop coverage/);
    expect(text).toMatch(/Systems\/tools they use: Fuse5 \(their DMS\)/);
  });
  it("ownership note fires when owned by another user (keeps RELATIONSHIP_OWNER token)", function () {
    expect(text).toMatch(/RELATIONSHIP_OWNER: NO/);
  });
  it("emits the account narrative story (4-part, with as-of date)", function () {
    expect(text).toMatch(/ACCOUNT STORY \(Pip's standing read · as of 2026-06-20\)/);
    expect(text).toMatch(/Where it stands: Re-engaged after the June rollout/);
    expect(text).toMatch(/Trajectory: Cooling — two follow-ups slipped/);
  });
  it("emits raw meeting notes + project notes (searchability)", function () {
    expect(text).toMatch(/Q1 review/);
    expect(text).toMatch(/Notes: Long verbatim notes/);
    expect(text).toMatch(/Project note \(Invoice feed\): Waiting on their IT/);
  });
  it("emits upcoming scheduled meetings", function () {
    expect(text).toMatch(/Upcoming scheduled meetings/);
    expect(text).toMatch(/Integration kickoff/);
  });
  it("emits open items with overdue prefix, commitments, contacts, cold + relationships", function () {
    expect(text).toMatch(/\[overdue \d+d\] Send CAPA cert docs/);
    expect(text).toMatch(/COMMITMENTS \(promised deliverables/);
    expect(text).toMatch(/Adam Reynolds — VP Sales/);
    expect(text).toMatch(/── RELATIONSHIPS ──/);
    expect(text).toMatch(/Champion: Adam Reynolds/);
  });
  it("does NOT show inline ✦/waiting markers on open items (chat has dedicated sections)", function () {
    expect(text).not.toMatch(/Send CAPA cert docs.*✦ commitment/);
  });
  it("emits projects with who-has-ball, pulses, and task assignees", function () {
    expect(text).toMatch(/Continental migration · in progress/);
    expect(text).toMatch(/WAITING ON: their IT \(since 2026-05-15\)/);
    expect(text).toMatch(/latest \(2026-05-18\): Waiting on legal sign-off/);
    expect(text).toMatch(/task: Map SKUs — assigned: dana/);
  });
  it("emits recent updates (with description), health trend, metrics, promise log, themes, operator read", function () {
    expect(text).toMatch(/Recent updates/);
    expect(text).toMatch(/Rolled out new pricing matrix/); // description included
    expect(text).toMatch(/HEALTH TREND .*healthy → watching/);
    expect(text).toMatch(/Account metrics: Score: 55/); // newest snapshot (04-30) wins
    expect(text).toMatch(/DELIVERY TRACK RECORD/);
    expect(text).toMatch(/PORTFOLIO PATTERNS/);
    expect(text).toMatch(/PIP'S OVERNIGHT OPERATOR READ/);
    expect(text).toMatch(/Headline: Drifting/);
  });
});

describe("buildAccountContext — summarize surface", function () {
  var text = renderAccountContext(fixture(), { surface: "summarize", userId: ME });
  it("emits objective, systems, contacts + relationships", function () {
    expect(text).toMatch(/Account Intel: Grow shop coverage/);
    expect(text).toMatch(/Systems\/tools they use: Fuse5/);
    expect(text).toMatch(/Adam Reynolds/);
    expect(text).toMatch(/── RELATIONSHIPS ──/);
  });
  it("uses Pip's meeting summary, NOT raw verbatim notes", function () {
    expect(text).toMatch(/Discussed Q1 numbers/);
    expect(text).not.toMatch(/Long verbatim notes/);
  });
  it("emits commitments, promise log, health trend, metrics, recent updates (no description)", function () {
    expect(text).toMatch(/COMMITMENTS \(promised deliverables/);
    expect(text).toMatch(/DELIVERY TRACK RECORD/);
    expect(text).toMatch(/HEALTH TREND/);
    expect(text).toMatch(/Account metrics:/);
    expect(text).toMatch(/Recent updates/);
    expect(text).not.toMatch(/Rolled out new pricing matrix/); // description omitted
  });
  it("operator read uses the 'don't re-propose' framing", function () {
    expect(text).toMatch(/already surfaced — don't re-propose/);
    expect(text).toMatch(/Already-flagged open risks: overdue commitment/);
  });
  it("intentionally omits open-items, projects, scheduled, cold-contacts, themes sections", function () {
    expect(text).not.toMatch(/Open items \(/);
    expect(text).not.toMatch(/Active projects \(/);
    expect(text).not.toMatch(/Upcoming scheduled meetings/);
    expect(text).not.toMatch(/CONTACTS NOT SEEN/);
    expect(text).not.toMatch(/PORTFOLIO PATTERNS/);
  });
});

describe("buildAccountContext — operator surface", function () {
  var text = renderAccountContext(operatorFixture(), { surface: "operator", userId: ME });
  it("emits header, ownership token, objective, systems", function () {
    expect(text).toMatch(/ACCOUNT: Parts Authority/);
    expect(text).toMatch(/RELATIONSHIP_OWNER: NO/);
    expect(text).toMatch(/Account Intel: Grow shop coverage/);
    expect(text).toMatch(/Systems\/tools they use: Fuse5/);
    expect(text).toMatch(/Tier: Major/); // tier preserved even w/o a status line
  });
  it("emits open tasks WITH inline ✦ commitment + waiting markers (no dedicated sections)", function () {
    expect(text).toMatch(/Send CAPA cert docs.*✦ commitment/);
    expect(text).toMatch(/Confirm rollout dates.*⏳ waiting on Adam \(since 2026-05-10\)/);
  });
  it("emits contacts with champion tag, projects with tasks", function () {
    expect(text).toMatch(/Adam Reynolds.*CHAMPION/);
    expect(text).toMatch(/Continental migration · in progress/);
    expect(text).toMatch(/task: Map SKUs/);
  });
  it("metrics line carries health_status (no status line on operator accounts)", function () {
    expect(text).toMatch(/Account metrics: Health: watching/);
    expect(text).toMatch(/Days since contact: 18/);
  });
  it("operator read = lessons learned + last-run situation for the delta", function () {
    expect(text).toMatch(/LESSONS PIP HAS LEARNED ON THIS ACCOUNT/);
    expect(text).toMatch(/Route invoice work to Gauge/);
    expect(text).toMatch(/WHAT PIP SAID LAST RUN/);
  });
  it("intentionally omits commitments, relationships, health-trend sections", function () {
    expect(text).not.toMatch(/COMMITMENTS \(promised deliverables/);
    expect(text).not.toMatch(/── RELATIONSHIPS ──/);
    expect(text).not.toMatch(/HEALTH TREND/);
  });
});

// ── PARITY CROSS-CHECKS — the fields whose drift caused the audit's #1 bug class.
// These assert a field reaches MORE THAN ONE surface, so a future edit that drops
// it from one path fails here.
describe("parity cross-checks (the drift lock)", function () {
  var chat = renderAccountContext(fixture(), { surface: "chat", userId: ME });
  var summ = renderAccountContext(fixture(), { surface: "summarize", userId: ME });
  var oper = renderAccountContext(operatorFixture(), { surface: "operator", userId: ME });

  it("ownership note reaches chat + summarize + operator", function () {
    expect(chat).toMatch(/RELATIONSHIP_OWNER: NO/);
    expect(summ).toMatch(/RELATIONSHIP_OWNER: NO/);
    expect(oper).toMatch(/RELATIONSHIP_OWNER: NO/);
  });
  it("promise log (delivery track record) reaches chat + summarize", function () {
    expect(chat).toMatch(/DELIVERY TRACK RECORD/);
    expect(summ).toMatch(/DELIVERY TRACK RECORD/);
  });
  it("waiting_on reaches chat (projects) + operator (open tasks)", function () {
    expect(chat).toMatch(/WAITING ON: their IT/);
    expect(oper).toMatch(/⏳ waiting on Adam/);
  });
  it("operator read reaches all three surfaces (different framing)", function () {
    expect(chat).toMatch(/PIP'S OVERNIGHT OPERATOR READ/);
    expect(summ).toMatch(/already surfaced — don't re-propose/);
    expect(oper).toMatch(/WHAT PIP SAID LAST RUN/);
  });
  it("account narrative reaches chat but NOT summarize/operator (v1 preset)", function () {
    expect(chat).toMatch(/ACCOUNT STORY/);
    expect(summ).not.toMatch(/ACCOUNT STORY/);
    expect(oper).not.toMatch(/ACCOUNT STORY/);
  });
  it("systems/glossary terms reach chat + summarize + operator", function () {
    expect(chat).toMatch(/Fuse5/);
    expect(summ).toMatch(/Fuse5/);
    expect(oper).toMatch(/Fuse5/);
  });
  it("structured build exposes named sections (for F2 persistence later)", function () {
    var built = buildAccountContext(fixture(), { surface: "chat", userId: ME });
    var keys = built.sections.map(function (s) { return s.key; });
    expect(keys).toContain("header");
    expect(keys).toContain("operatorRead");
    expect(keys).toContain("promiseLog");
  });
});

// ── F2/F3 content fingerprint (event-driven recompute gate) ───────────────
describe("computeContextFingerprint", function () {
  afterEach(function () { vi.useRealTimers(); });

  // Raw-DB-row bundle (NOT the buildAccountContext mapped shape — the server
  // hashes what it loaded, which still carries updated_at).
  function bundle() {
    return {
      account: {
        id: "acc-1", name: "ABPA", status: "active", status_override: null,
        tier: "Major", account_type: "mso", owner_user_id: "me",
        last_interaction_at: "2026-06-15T10:00:00Z",
        objective: "Grow integration coverage", systems: ["Fuse5", "Trax"],
      },
      meetings: [
        { id: "m1", meeting_date: "2026-06-15", updated_at: "2026-06-15T10:05:00Z", title: "Cadence" },
        { id: "m2", meeting_date: "2026-06-01", updated_at: "2026-06-01T09:00:00Z", title: "Kickoff" },
      ],
      tasks: [
        { id: "t1", done: false, status: "in_progress", updated_at: "2026-06-15T11:00:00Z" },
        { id: "t2", done: true,  status: "complete",    updated_at: "2026-06-10T08:00:00Z" },
      ],
      contacts: [
        { name: "Jane", relationship_role: "champion", is_primary: true },
        { name: "Bob",  relationship_role: "neutral",  is_primary: false },
      ],
      projects: [
        { id: "p1", status: "in_progress", status_updates: [{ at: "2026-06-14T00:00:00Z", body: "x" }] },
      ],
      updates: [{ update_date: "2026-06-12" }],
    };
  }

  it("is deterministic and order-independent", function () {
    var a = computeContextFingerprint(bundle());
    var b = bundle();
    b.meetings.reverse(); b.contacts.reverse(); b.tasks.reverse();
    expect(computeContextFingerprint(b)).toBe(a);
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
  });

  it("is TIME-STABLE — same data a day later hashes identically (the drift lock)", function () {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T09:00:00Z"));
    var day1 = computeContextFingerprint(bundle());
    vi.setSystemTime(new Date("2026-06-25T09:00:00Z")); // 9 days later, SAME data
    var day9 = computeContextFingerprint(bundle());
    expect(day9).toBe(day1);
  });

  it("changes when a meeting is added / summarized (updated_at bumps)", function () {
    var base = computeContextFingerprint(bundle());
    var added = bundle();
    added.meetings.push({ id: "m3", meeting_date: "2026-06-16", updated_at: "2026-06-16T12:00:00Z" });
    expect(computeContextFingerprint(added)).not.toBe(base);
    var edited = bundle();
    edited.meetings[0].updated_at = "2026-06-16T13:00:00Z"; // re-summarized
    expect(computeContextFingerprint(edited)).not.toBe(base);
  });

  it("changes when a task closes (done flips + updated_at bumps)", function () {
    var base = computeContextFingerprint(bundle());
    var closed = bundle();
    closed.tasks[0].done = true;
    closed.tasks[0].status = "complete";
    closed.tasks[0].updated_at = "2026-06-16T14:00:00Z";
    expect(computeContextFingerprint(closed)).not.toBe(base);
  });

  it("changes on account scalar edits (status_override, objective, systems)", function () {
    var base = computeContextFingerprint(bundle());
    var ov = bundle(); ov.account.status_override = "at_risk";
    expect(computeContextFingerprint(ov)).not.toBe(base);
    var obj = bundle(); obj.account.objective = "Totally different objective";
    expect(computeContextFingerprint(obj)).not.toBe(base);
    var sys = bundle(); sys.account.systems = ["Fuse5"];
    expect(computeContextFingerprint(sys)).not.toBe(base);
  });

  it("changes on contact role / project status / account update changes", function () {
    var base = computeContextFingerprint(bundle());
    var role = bundle(); role.contacts[1].relationship_role = "blocker";
    expect(computeContextFingerprint(role)).not.toBe(base);
    var proj = bundle(); proj.projects[0].status = "complete";
    expect(computeContextFingerprint(proj)).not.toBe(base);
    var upd = bundle(); upd.updates.push({ update_date: "2026-06-18" });
    expect(computeContextFingerprint(upd)).not.toBe(base);
  });

  it("tolerates empty / missing bundle without throwing", function () {
    expect(typeof computeContextFingerprint({})).toBe("string");
    expect(typeof computeContextFingerprint(undefined)).toBe("string");
    expect(computeContextFingerprint({})).toBe(computeContextFingerprint({ account: {}, meetings: [], tasks: [] }));
  });
});

// ── F6 — semantic recall section ──────────────────────────────────────────
describe("buildAccountContext — recall (F6)", function () {
  function withRecall() {
    var a = fixture();
    a.recallHits = [
      { content: "Six months ago we agreed to phase the invoice feed behind a feature flag.", source_type: "meeting_summary", date: "2025-12-10T00:00:00Z", similarity: 0.81 },
      { content: "Adam flagged that their IT needs 30 days lead time to whitelist new endpoints.", source_type: "meeting_notes", date: "2026-01-15", similarity: 0.74 },
    ];
    return a;
  }

  it("renders recall hits on the chat surface", function () {
    var text = renderAccountContext(withRecall(), { surface: "chat", userId: ME });
    expect(text).toContain("RELEVANT PAST NOTES");
    expect(text).toContain("feature flag");
    expect(text).toContain("[meeting summary · 2025-12-10]");
    expect(text).toContain("[meeting note · 2026-01-15]");
  });

  it("omits recall on summarize + operator surfaces even when hits are present", function () {
    var summ = renderAccountContext(withRecall(), { surface: "summarize", userId: ME });
    expect(summ).not.toContain("RELEVANT PAST NOTES");
    var opFix = operatorFixture(); opFix.recallHits = withRecall().recallHits;
    var oper = renderAccountContext(opFix, { surface: "operator", userId: ME });
    expect(oper).not.toContain("RELEVANT PAST NOTES");
  });

  it("emits no recall section when there are no hits (chat)", function () {
    var text = renderAccountContext(fixture(), { surface: "chat", userId: ME });
    expect(text).not.toContain("RELEVANT PAST NOTES");
    var built = buildAccountContext(fixture(), { surface: "chat", userId: ME });
    expect(built.sections.some(function (s) { return s.key === "recall"; })).toBe(false);
  });

  it("caps to recallLimit and truncates long content", function () {
    var a = fixture();
    a.recallHits = [];
    for (var i = 0; i < 10; i++) a.recallHits.push({ content: "x".repeat(600) + " hit" + i, source_type: "meeting_notes" });
    var built = buildAccountContext(a, { surface: "chat", userId: ME, recallLimit: 2, recallChars: 50 });
    var recall = built.sections.find(function (s) { return s.key === "recall"; });
    expect(recall).toBeTruthy();
    var rows = recall.text.split("\n").filter(function (l) { return l.indexOf("- [") === 0; });
    expect(rows.length).toBe(2);
    expect(rows[0].length).toBeLessThan(80); // truncated to ~50 + label + ellipsis
  });

  it("recallSourceLabel maps known + unknown source types", function () {
    expect(recallSourceLabel("meeting_notes")).toBe("meeting note");
    expect(recallSourceLabel("account_update")).toBe("account update");
    expect(recallSourceLabel("something_else")).toBe("note");
  });
});
