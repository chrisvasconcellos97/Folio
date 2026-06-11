import { describe, it, expect, vi } from "vitest";
import { executeTool, isFrictionless } from "./pipExecutor";

var sampleAccounts = [
  { id: "a1", name: "KSI Auto Parts" },
  { id: "a2", name: "LKQ" },
];

describe("isFrictionless", function () {
  it("flags navigate / open_* as frictionless", function () {
    expect(isFrictionless("navigate")).toBe(true);
    expect(isFrictionless("open_meeting")).toBe(true);
    expect(isFrictionless("open_item")).toBe(true);
    expect(isFrictionless("open_contact")).toBe(true);
    expect(isFrictionless("open_cadence")).toBe(true);
    // complete_task was moved to `confirm` in Phase 1 — a poisoned meeting
    // note shouldn't be able to silently close the user's tasks.
    expect(isFrictionless("complete_task")).toBe(false);
  });

  it("does NOT flag confirm-required tools", function () {
    expect(isFrictionless("create_open_item")).toBe(false);
    expect(isFrictionless("log_meeting")).toBe(false);
    expect(isFrictionless("set_follow_up")).toBe(false);
    expect(isFrictionless("update_account_health")).toBe(false);
    expect(isFrictionless("schedule_cadence")).toBe(false);
    expect(isFrictionless("add_quick_task")).toBe(false);
    expect(isFrictionless("remember_fact")).toBe(false);
  });

  it("returns false for unknown tools", function () {
    expect(isFrictionless("not_a_tool")).toBe(false);
    expect(isFrictionless("")).toBe(false);
  });
});

describe("executeTool", function () {
  it("returns ok:false for unknown tool name", async function () {
    var r = await executeTool({ tool: { name: "not_a_tool" }, hooks: {} });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("error");
    expect(r.error).toContain("not_a_tool");
  });

  it("returns ok:false when tool has no name", async function () {
    var r = await executeTool({ tool: {}, hooks: {} });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("error");
  });

  it("routes create_open_item to addItem hook", async function () {
    var addItem = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "create_open_item", input: { account_id: "a1", text: "Send CAPA" } },
      hooks: { accounts: sampleAccounts, addItem: addItem },
    });
    expect(addItem).toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Open item created");
  });

  it("routes log_meeting to addMeeting hook", async function () {
    var addMeeting = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "log_meeting", input: { account_id: "a1", title: "Catch up", meeting_date: "2026-05-20" } },
      hooks: { accounts: sampleAccounts, addMeeting: addMeeting },
    });
    expect(addMeeting).toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Meeting logged");
  });

  it("routes complete_task to updateTask hook", async function () {
    var updateTask = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "complete_task", input: { task_id: "abc" } },
      hooks: { updateTask: updateTask },
    });
    expect(updateTask).toHaveBeenCalledWith("abc", { done: true, status: "complete" });
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Task completed");
  });

  it("routes add_quick_task to addTask hook", async function () {
    var addTask = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "add_quick_task", input: { title: "Call Lisa" } },
      hooks: { addTask: addTask },
    });
    expect(addTask).toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Task added");
  });

  it("routes set_follow_up to setFollowUp hook", async function () {
    var setFollowUp = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "set_follow_up", input: { account_id: "a1", follow_up_date: "2026-06-01" } },
      hooks: { setFollowUp: setFollowUp },
    });
    expect(setFollowUp).toHaveBeenCalledWith("a1", "2026-06-01");
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Follow-up set");
  });

  it("routes update_account_health to updateAccount hook", async function () {
    var updateAccount = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "update_account_health", input: { account_id: "a1", status: "at_risk" } },
      hooks: { updateAccount: updateAccount },
    });
    // at_risk pins via the status_override columns, not the raw status column.
    expect(updateAccount).toHaveBeenCalledWith("a1", {
      status_override: "red",
      status_override_reason: "Set via Pip",
    });
    expect(r.ok).toBe(true);
  });

  it("routes schedule_cadence to addCadence hook", async function () {
    var addCadence = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "schedule_cadence", input: { account_id: "a1", frequency: "weekly", day_of_week: 3 } },
      hooks: { addCadence: addCadence },
    });
    expect(addCadence).toHaveBeenCalled();
    expect(r.ok).toBe(true);
  });

  it("routes remember_fact to addFact hook", async function () {
    var addFact = vi.fn().mockResolvedValue();
    var r = await executeTool({
      tool: { name: "remember_fact", input: { fact: "West region" } },
      hooks: { addFact: addFact },
    });
    expect(addFact).toHaveBeenCalledWith({ fact: "West region", source: "pip_inferred" });
    expect(r.ok).toBe(true);
  });

  it("routes navigate to onNavigate and returns navTarget", async function () {
    var onNavigate = vi.fn();
    var r = await executeTool({
      tool: { name: "navigate", input: { view: "cadence" } },
      hooks: { onNavigate: onNavigate },
    });
    expect(onNavigate).toHaveBeenCalledWith("cadence");
    expect(r.ok).toBe(true);
    expect(r.navTarget).toBe("cadence");
  });

  it("routes open_meeting to onOpenAction with the resolved account", async function () {
    var onOpenAction = vi.fn();
    var r = await executeTool({
      tool: { name: "open_meeting", input: { account_name: "KSI Auto Parts" } },
      hooks: { accounts: sampleAccounts, onOpenAction: onOpenAction },
    });
    expect(onOpenAction).toHaveBeenCalled();
    expect(onOpenAction.mock.calls[0][1].id).toBe("a1");
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Opened");
  });

  it("surfaces hook errors as ok:false", async function () {
    var addItem = vi.fn().mockRejectedValue(new Error("DB exploded"));
    var r = await executeTool({
      tool: { name: "create_open_item", input: { account_id: "a1", text: "x" } },
      hooks: { accounts: sampleAccounts, addItem: addItem },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("DB exploded");
  });
});
