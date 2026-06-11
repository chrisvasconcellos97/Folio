import { describe, it, expect, vi } from "vitest";
import {
  PIP_TOOLS,
  TOOL_META,
  classifyTool,
  describeToolCall,
  displayTitleFor,
  findAccountByName,
  getFieldsForTool,
  needsConfirm,
  planToolCalls,
  routeToolCall,
  CONFIRM_THRESHOLD,
} from "./pipTools";

var sampleAccounts = [
  { id: "a1", name: "KSI Auto Parts" },
  { id: "a2", name: "All Star Auto" },
  { id: "a3", name: "LKQ" },
];

describe("PIP_TOOLS schema", function () {
  it("has the expected tool names", function () {
    var names = PIP_TOOLS.map(function (t) { return t.name; });
    expect(names).toContain("open_meeting");
    expect(names).toContain("open_item");
    expect(names).toContain("open_contact");
    expect(names).toContain("open_cadence");
    expect(names).toContain("navigate");
    expect(names).toContain("complete_task");
    expect(names).toContain("add_quick_task");
    expect(names).toContain("create_open_item");
    expect(names).toContain("log_meeting");
    expect(names).toContain("set_follow_up");
    expect(names).toContain("update_account_health");
    expect(names).toContain("schedule_cadence");
    expect(names).toContain("remember_fact");
  });

  it("every tool declares an input_schema", function () {
    PIP_TOOLS.forEach(function (t) {
      expect(t.input_schema).toBeTruthy();
      expect(t.input_schema.type).toBe("object");
    });
  });
});

describe("classifyTool", function () {
  it("buckets open_* as open", function () {
    expect(classifyTool("open_meeting")).toBe("open");
    expect(classifyTool("open_cadence")).toBe("open");
  });
  it("buckets navigate separately", function () {
    expect(classifyTool("navigate")).toBe("navigate");
  });
  it("buckets everything else as execute", function () {
    expect(classifyTool("create_open_item")).toBe("execute");
    expect(classifyTool("remember_fact")).toBe("execute");
  });
});

describe("findAccountByName", function () {
  it("matches exact (case-insensitive)", function () {
    expect(findAccountByName(sampleAccounts, "ksi auto parts").id).toBe("a1");
  });
  it("matches substring", function () {
    expect(findAccountByName(sampleAccounts, "all star").id).toBe("a2");
  });
  it("returns null when not found", function () {
    expect(findAccountByName(sampleAccounts, "NAPA")).toBeNull();
  });
});

describe("describeToolCall", function () {
  it("describes create_open_item with account+text", function () {
    var d = describeToolCall(
      { name: "create_open_item", input: { account_id: "a1", text: "Send CAPA docs" } },
      sampleAccounts
    );
    expect(d).toContain("KSI Auto Parts");
    expect(d).toContain("Send CAPA docs");
  });
  it("describes navigate", function () {
    expect(describeToolCall({ name: "navigate", input: { view: "cadence" } }, sampleAccounts)).toBe("Go to cadence");
  });
});

describe("planToolCalls (Phase 2.5)", function () {
  it("handles empty input", function () {
    var p = planToolCalls([]);
    expect(p.needsConfirmation).toBe(false);
    expect(p.immediate.length).toBe(0);
    expect(p.mode).toBe("none");
  });

  it("routes a single confirm-required tool to mode 'single'", function () {
    var p = planToolCalls([
      { name: "create_open_item", input: { account_id: "a1", text: "x" } },
    ]);
    expect(p.needsConfirmation).toBe(true);
    expect(p.confirm.length).toBe(1);
    expect(p.immediate.length).toBe(0);
    expect(p.mode).toBe("single");
  });

  it("routes ≥2 confirm-required tools to mode 'batch'", function () {
    var p = planToolCalls([
      { name: "create_open_item", input: { account_id: "a1", text: "x" } },
      { name: "log_meeting",      input: { account_id: "a1", title: "y", meeting_date: "2026-05-20" } },
    ]);
    expect(p.needsConfirmation).toBe(true);
    expect(p.confirm.length).toBe(2);
    expect(p.mode).toBe("batch");
  });

  it("splits mixed responses — frictionless go immediate, confirms go to card", function () {
    var p = planToolCalls([
      { name: "navigate",        input: { view: "cadence" } },
      { name: "complete_task",   input: { task_id: "abc" } },
      { name: "open_meeting",    input: { account_name: "KSI" } },
      { name: "create_open_item",input: { account_id: "a1", text: "x" } },
      { name: "create_open_item",input: { account_id: "a2", text: "y" } },
      { name: "create_open_item",input: { account_id: "a3", text: "z" } },
    ]);
    // complete_task moved to `confirm` in Phase 1, so it lands with the
    // create_open_item calls in the confirm bucket. Immediate is now just
    // navigate + open_meeting.
    expect(p.immediate.length).toBe(2);
    expect(p.confirm.length).toBe(4);
    expect(p.mode).toBe("batch");
    expect(p.dominantType).toBe("create_open_item");
  });

  it("remember_fact now requires confirmation (Phase 2.5 change)", function () {
    var p = planToolCalls([
      { name: "remember_fact", input: { fact: "Covers the West" } },
    ]);
    expect(p.needsConfirmation).toBe(true);
    expect(p.mode).toBe("single");
  });

  it("CONFIRM_THRESHOLD constant is exported (back-compat)", function () {
    expect(typeof CONFIRM_THRESHOLD).toBe("number");
  });
});

describe("TOOL_META + helpers", function () {
  it("classifies every tool", function () {
    PIP_TOOLS.forEach(function (t) {
      expect(TOOL_META[t.name]).toBeTruthy();
      expect(["open", "navigate", "frictionless", "confirm"]).toContain(TOOL_META[t.name].category);
    });
  });

  it("needsConfirm returns true only for category=confirm", function () {
    expect(needsConfirm("create_open_item")).toBe(true);
    expect(needsConfirm("log_meeting")).toBe(true);
    expect(needsConfirm("remember_fact")).toBe(true);
    // complete_task moved to `confirm` in Phase 1 (meeting-note injection guard).
    expect(needsConfirm("complete_task")).toBe(true);
    expect(needsConfirm("navigate")).toBe(false);
    expect(needsConfirm("open_meeting")).toBe(false);
    expect(needsConfirm("not_a_tool")).toBe(false);
  });

  it("displayTitleFor returns the configured title", function () {
    expect(displayTitleFor("create_open_item")).toBe("create an open item");
    expect(displayTitleFor("log_meeting")).toBe("log a meeting");
    expect(displayTitleFor("not_a_tool")).toBe("not a tool");
  });
});

describe("getFieldsForTool", function () {
  it("returns required-flag matching input_schema", function () {
    var fields = getFieldsForTool("create_open_item", { account_id: "a1", text: "Send CAPA" }, sampleAccounts);
    var account = fields.find(function (f) { return f.key === "account_id"; });
    var text    = fields.find(function (f) { return f.key === "text"; });
    var due     = fields.find(function (f) { return f.key === "due_date"; });
    expect(account.required).toBe(true);
    expect(text.required).toBe(true);
    expect(due.required).toBe(false);
  });

  it("resolves account_id to display name", function () {
    var fields = getFieldsForTool("create_open_item", { account_id: "a1", text: "x" }, sampleAccounts);
    var account = fields.find(function (f) { return f.key === "account_id"; });
    expect(account.displayValue).toBe("KSI Auto Parts");
  });

  it("formats dates as 'Mon DD, YYYY'", function () {
    var fields = getFieldsForTool("set_follow_up", { account_id: "a1", follow_up_date: "2026-06-15" }, sampleAccounts);
    var f = fields.find(function (x) { return x.key === "follow_up_date"; });
    expect(f.displayValue).toContain("Jun");
    expect(f.displayValue).toContain("2026");
  });

  it("returns empty array for unknown tool", function () {
    expect(getFieldsForTool("not_a_tool", {}, sampleAccounts)).toEqual([]);
  });
});

describe("routeToolCall — routing to hooks", function () {
  it("routes complete_task to updateTask hook", async function () {
    var updateTask = vi.fn().mockResolvedValue();
    var r = await routeToolCall(
      { id: "t1", name: "complete_task", input: { task_id: "abc-123" } },
      { accounts: sampleAccounts, updateTask: updateTask }
    );
    expect(updateTask).toHaveBeenCalledWith("abc-123", { done: true, status: "complete" });
    expect(r.kind).toBe("executed");
  });

  it("routes create_open_item to addItem hook with resolved account", async function () {
    var addItem = vi.fn().mockResolvedValue();
    var r = await routeToolCall(
      { id: "t2", name: "create_open_item", input: { account_id: "a1", text: "Send report", due_date: "2026-06-01" } },
      { accounts: sampleAccounts, addItem: addItem }
    );
    expect(addItem).toHaveBeenCalledWith({
      account_id: "a1",
      text: "Send report",
      due_date: "2026-06-01",
      owner: null,
    });
    expect(r.kind).toBe("executed");
  });

  it("routes log_meeting to addMeeting hook", async function () {
    var addMeeting = vi.fn().mockResolvedValue();
    await routeToolCall(
      { id: "t3", name: "log_meeting", input: { account_id: "a1", title: "Catch up", meeting_date: "2026-05-20" } },
      { accounts: sampleAccounts, addMeeting: addMeeting }
    );
    expect(addMeeting).toHaveBeenCalled();
    expect(addMeeting.mock.calls[0][0].account_id).toBe("a1");
    expect(addMeeting.mock.calls[0][0].title).toBe("Catch up");
  });

  it("routes schedule_cadence to addCadence with filtered fields", async function () {
    var addCadence = vi.fn().mockResolvedValue();
    await routeToolCall(
      { id: "t4", name: "schedule_cadence", input: { account_id: "a1", frequency: "weekly", day_of_week: 2, meeting_time: "15:00" } },
      { accounts: sampleAccounts, addCadence: addCadence }
    );
    expect(addCadence).toHaveBeenCalledWith({
      account_id: "a1",
      frequency: "weekly",
      day_of_week: 2,
      meeting_time: "15:00",
    });
  });

  it("routes set_follow_up to setFollowUp hook", async function () {
    var setFollowUp = vi.fn().mockResolvedValue();
    await routeToolCall(
      { id: "t5", name: "set_follow_up", input: { account_id: "a1", follow_up_date: "2026-06-15" } },
      { accounts: sampleAccounts, setFollowUp: setFollowUp }
    );
    expect(setFollowUp).toHaveBeenCalledWith("a1", "2026-06-15");
  });

  it("routes update_account_health to updateAccount hook", async function () {
    var updateAccount = vi.fn().mockResolvedValue();
    await routeToolCall(
      { id: "t6", name: "update_account_health", input: { account_id: "a1", status: "at_risk" } },
      { accounts: sampleAccounts, updateAccount: updateAccount }
    );
    // at_risk/cold pin the account via the status_override columns (health is
    // computed; the raw status column is not written by this tool).
    expect(updateAccount).toHaveBeenCalledWith("a1", {
      status_override: "red",
      status_override_reason: "Set via Pip",
    });
  });

  it("routes navigate to onNavigate callback", async function () {
    var onNavigate = vi.fn();
    var r = await routeToolCall(
      { id: "t7", name: "navigate", input: { view: "cadence" } },
      { onNavigate: onNavigate }
    );
    expect(onNavigate).toHaveBeenCalledWith("cadence");
    expect(r.kind).toBe("navigate");
  });

  it("routes open_meeting to onOpenAction with resolved account", async function () {
    var onOpenAction = vi.fn();
    var r = await routeToolCall(
      { id: "t8", name: "open_meeting", input: { account_name: "KSI Auto Parts" } },
      { accounts: sampleAccounts, onOpenAction: onOpenAction }
    );
    expect(onOpenAction).toHaveBeenCalled();
    expect(onOpenAction.mock.calls[0][1].id).toBe("a1");
    expect(r.kind).toBe("open");
  });

  it("returns error when account_name resolves to nothing", async function () {
    var r = await routeToolCall(
      { id: "t9", name: "open_meeting", input: { account_name: "NAPA Auto Care" } },
      { accounts: sampleAccounts, onOpenAction: function () {} }
    );
    expect(r.kind).toBe("error");
  });

  it("routes remember_fact to addFact hook with pip_inferred source", async function () {
    var addFact = vi.fn().mockResolvedValue();
    await routeToolCall(
      { id: "t10", name: "remember_fact", input: { fact: "Covers the West region" } },
      { addFact: addFact }
    );
    expect(addFact).toHaveBeenCalledWith({ fact: "Covers the West region", source: "pip_inferred" });
  });
});
