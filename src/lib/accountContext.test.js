import { describe, it, expect } from "vitest";
import { buildAccountContext, renderAccountContext } from "./accountContext";

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
