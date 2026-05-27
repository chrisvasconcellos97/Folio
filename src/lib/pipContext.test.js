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
});
