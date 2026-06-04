import { describe, it, expect } from "vitest";
import { detectKnowledgeGaps } from "./detectKnowledgeGaps";

// Minimal chainable Supabase mock that records inserted rows and returns no
// existing questions (so every candidate is "new").
function mockSupabase(captured) {
  function builder() {
    var b = {
      select: function () { return b; },
      eq:     function () { return b; },
      in:     function () { return b; },
      then:   function (resolve) { return Promise.resolve({ data: [] }).then(resolve); },
    };
    return b;
  }
  return {
    from: function (table) {
      return {
        select: function () { return builder(); },
        insert: function (rows) { captured.push.apply(captured, rows); return Promise.resolve({ error: null }); },
      };
    },
  };
}

describe("detectKnowledgeGaps — contact role gap", function () {
  it("fires for a role-less contact who attends 3+ meetings under an informal name", async function () {
    var captured = [];
    var contacts = [{ id: "c1", name: "Sarah Chen" /* no title */ }];
    var meetings = [
      { attendees: ["Sarah"] },
      { attendees: ["sarah chen"] },
      { attendees: ["Sarah C (buyer)"] },
    ];
    await detectKnowledgeGaps({
      userId: "u1", supabase: mockSupabase(captured),
      accounts: [], meetings: meetings, contacts: contacts, profile: null,
    });
    var roleGap = captured.find(function (r) { return r.category === "gap" && /Sarah Chen/.test(r.question_text); });
    expect(roleGap).toBeTruthy();
    expect(roleGap.trigger_context).toBe("c1");
  });

  it("does NOT fire when the contact already has a title", async function () {
    var captured = [];
    var contacts = [{ id: "c1", name: "Sarah Chen", title: "Buyer" }];
    var meetings = [{ attendees: ["Sarah"] }, { attendees: ["Sarah"] }, { attendees: ["Sarah"] }];
    await detectKnowledgeGaps({
      userId: "u1", supabase: mockSupabase(captured),
      accounts: [], meetings: meetings, contacts: contacts, profile: null,
    });
    expect(captured.find(function (r) { return /Sarah Chen/.test(r.question_text); })).toBeFalsy();
  });
});
