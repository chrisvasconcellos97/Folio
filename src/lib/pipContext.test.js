import { describe, it, expect } from "vitest";
import { curateContext, renderContextProse } from "./pipContext";

var raw = {
  accounts: [
    {
      id: "a1", name: "KSI Auto Parts", status: "active", health: "green",
      last_interaction_at: "2026-05-01",
      notes: "Big nationwide parts account.",
      tags: ["parts", "national"],
      meetings: [
        { date: "2026-04-12", title: "Q1 review", summary: "Talked through Q1 numbers.", action_items: "Send CAPA docs", attendees: ["Adam", "Lisa"] },
        { date: "2026-03-15", title: "Kickoff" },
      ],
      openItems: [
        { text: "Send CAPA cert docs", due: "2020-04-22" },
        { text: "Confirm rollout dates" },
      ],
      contacts: [
        { name: "Adam Reynolds", title: "VP Sales", email: "adam@ksi.com", is_poc: true },
      ],
      activeProjects: [{ title: "Continental migration", status: "in_progress", due_date: "2026-05-30" }],
    },
    {
      id: "a2", name: "All Star Auto", status: "warming", health: "yellow",
      last_interaction_at: "2026-02-10",
      meetings: [],
      openItems: [],
      contacts: [],
      activeProjects: [],
    },
  ],
  openQuickTasks: [{ id: "t1", title: "Call Lisa back" }],
};

describe("brief surface ownership note (H2 drift-lock)", function () {
  // The two brief callers (callBriefMePip / callCadenceBriefPip) must set
  // context.userId + account.owner_user_id so the RELATIONSHIP_OWNER:NO guard
  // fires on briefs the way it does in chat. This locks the render contract:
  // given both, renderContextProse emits the token; missing userId → it doesn't.
  var ownedRaw = {
    userId: "me",
    briefMode: true,
    accounts: [{
      id: "a9", name: "MSO Co", owner_user_id: "someone-else",
      status: "active", meetings: [], openItems: [], contacts: [], activeProjects: [],
    }],
  };
  it("emits RELATIONSHIP_OWNER:NO when userId + owner_user_id (mismatch) flow through", function () {
    var out = renderContextProse(curateContext(ownedRaw, "brief me on MSO Co", ["a9"]));
    expect(out).toMatch(/RELATIONSHIP_OWNER: NO/);
  });
  it("does NOT emit it when userId is absent (the pre-H2 bug)", function () {
    var noUser = Object.assign({}, ownedRaw, { userId: null });
    var out = renderContextProse(curateContext(noUser, "brief me on MSO Co", ["a9"]));
    expect(out).not.toMatch(/RELATIONSHIP_OWNER: NO/);
  });
});

describe("curateContext", function () {
  it("resolves account by name mention", function () {
    var out = curateContext(raw, "tell me about KSI", null);
    expect(out.mode).toBe("focused");
    expect(out.accounts.length).toBe(1);
    expect(out.accounts[0].name).toBe("KSI Auto Parts");
  });

  it("uses focusedAccountIds when given", function () {
    var out = curateContext(raw, "anything", ["a2"]);
    expect(out.mode).toBe("focused");
    expect(out.accounts[0].id).toBe("a2");
  });

  it("falls back to list-only view when no match", function () {
    var out = curateContext(raw, "what should I focus on this week?", null);
    expect(out.mode).toBe("list");
    expect(out.accounts.length).toBe(2);
    // list view should not have nested meetings
    expect(out.accounts[0].meetings).toBeUndefined();
  });
});

describe("renderContextProse", function () {
  it("renders focused account with header and meetings", function () {
    var curated = curateContext(raw, "tell me about KSI", null);
    var text = renderContextProse(curated);
    expect(text).toMatch(/ACCOUNT: KSI Auto Parts/);
    expect(text).toMatch(/Q1 review/);
    expect(text).toMatch(/\[overdue/);  // 2020-04-22 due, well in the past
  });

  it("renders list view compactly", function () {
    var curated = curateContext(raw, "general question", null);
    var text = renderContextProse(curated);
    expect(text).toMatch(/ACCOUNTS \(list view/);
    expect(text).toMatch(/KSI Auto Parts/);
    expect(text).toMatch(/All Star Auto/);
    // shouldn't include nested meeting titles in list view
    expect(text).not.toMatch(/Q1 review/);
  });

  it("includes open quick tasks", function () {
    var curated = curateContext(raw, "general", null);
    var text = renderContextProse(curated);
    expect(text).toMatch(/OPEN QUICK TASKS/);
    expect(text).toMatch(/Call Lisa back/);
  });

  it("flags open items with no due date that have been open a long time", function () {
    var old = new Date(Date.now() - 40 * 86400000).toISOString();
    var staleRaw = {
      accounts: [{
        id: "p1", name: "Parts Authority", status: "active", health: "green",
        last_interaction_at: "2026-05-01", meetings: [], contacts: [], activeProjects: [],
        openItems: [
          { text: "Send updated pricing sheet", created_at: old },          // 40d, no due
          { text: "Schedule onboarding", created_at: new Date().toISOString() }, // fresh, no due
        ],
      }],
    };
    var curated = curateContext(staleRaw, "brief me on Parts Authority", ["p1"]);
    var text = renderContextProse(curated);
    // Stale item gets the [open Nd, no due date] flag so Pip surfaces it.
    expect(text).toMatch(/\[open \d+d, no due date\] Send updated pricing sheet/);
    // Fresh item shows its age but no stale flag.
    expect(text).toMatch(/Schedule onboarding · opened 0d ago, no due date/);
    expect(text).not.toMatch(/\[open \d+d, no due date\] Schedule onboarding/);
  });
});

describe("renderContextProse — F6 recall", function () {
  it("renders the global recall lane (list mode) with account labels + source dedup", function () {
    var curated = curateContext(raw, "general question", null);
    curated.globalRecall = [
      { content: "We agreed to phase the invoice feed behind a flag.", source_type: "meeting_summary", source_id: "m1", account_id: "acc-ksi", account_name: "KSI Auto Parts", similarity: 0.8 },
      { content: "duplicate source should be dropped", source_type: "meeting_notes", source_id: "m1", account_id: "acc-ksi", account_name: "KSI Auto Parts", similarity: 0.7 },
      { content: "Their IT needs 30 days lead time.", source_type: "meeting_notes", source_id: "m2", account_id: "acc-as", account_name: "All Star Auto", similarity: 0.6 },
    ];
    var text = renderContextProse(curated);
    expect(text).toMatch(/RELEVANT PAST CONTEXT \(semantic recall across all accounts/);
    expect(text).toMatch(/\[meeting summary · KSI Auto Parts\] We agreed to phase/);
    expect(text).toMatch(/\[meeting note · All Star Auto\] Their IT needs/);
    expect(text).not.toMatch(/duplicate source should be dropped/); // deduped by source_id
  });

  it("renders per-account recall hits attached in focused mode", function () {
    var curated = curateContext(raw, "tell me about KSI", null);
    curated.accounts[0].recallHits = [
      { content: "Six months ago we picked the phased rollout.", source_type: "meeting_summary", source_id: "old1" },
    ];
    var text = renderContextProse(curated);
    expect(text).toMatch(/RELEVANT PAST NOTES/);
    expect(text).toMatch(/phased rollout/);
  });

  it("emits nothing when globalRecall is empty/absent", function () {
    var curated = curateContext(raw, "general question", null);
    var text = renderContextProse(curated);
    expect(text).not.toMatch(/RELEVANT PAST CONTEXT/);
  });
});
