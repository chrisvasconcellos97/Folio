import { describe, it, expect, vi } from "vitest";

// Stub out the Supabase-dependent hook so the module loads in test env.
vi.mock("../hooks/usePipAssignmentHints", function () {
  return {
    taskPattern: function (text) {
      return String(text || "").toLowerCase().trim().slice(0, 40);
    },
  };
});
// projectTasks.js (imported for nextSortOrder) pulls in the supabase client,
// which needs env at import — stub it so the module loads in test env.
vi.mock("../lib/supabase", function () {
  return { supabase: { from: function () { return {}; } } };
});

import { applyPipPlan } from "./pipPlanApply";

function makeCtx(overrides) {
  return Object.assign({
    addItem:       vi.fn().mockResolvedValue({}),
    updateItem:    vi.fn().mockResolvedValue({}),
    closeItem:     vi.fn().mockResolvedValue({}),
    updateProject: vi.fn().mockResolvedValue({}),
    addHint:       vi.fn().mockResolvedValue({}),
    accountId:     "acct-1",
    cadenceId:     null,
    meetingId:     "meet-1",
    activeProjects: [],
  }, overrides);
}

// ── new_item routing ───────────────────────────────────────────────────

describe("applyPipPlan — new_item", function () {
  it("calls addItem with correct payload", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "new_item", text: "Follow up on contract", due_date: "2026-07-01", assignee: null, recipient: null, is_commitment: false, target_account_id: null } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.addItem).toHaveBeenCalledOnce();
    var call = ctx.addItem.mock.calls[0][0];
    expect(call.text).toBe("Follow up on contract");
    expect(call.account_id).toBe("acct-1");
    expect(call.source_meeting_id).toBe("meet-1");
  });

  it("preserves is_commitment flag", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "new_item", text: "Send deck by Friday", due_date: null, assignee: null, recipient: null, is_commitment: true, target_account_id: null } }];
    await applyPipPlan(selected, ctx);
    var call = ctx.addItem.mock.calls[0][0];
    expect(call.is_commitment).toBe(true);
  });

  it("uses target_account_id when provided (cross-account routing)", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "new_item", text: "Audit request", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: "acct-other" } }];
    await applyPipPlan(selected, ctx);
    var call = ctx.addItem.mock.calls[0][0];
    expect(call.account_id).toBe("acct-other");
  });

  it("records an error when addItem rejects", async function () {
    var ctx = makeCtx({ addItem: vi.fn().mockRejectedValue(new Error("DB error")) });
    var selected = [{ idx: 0, row: { kind: "new_item", text: "Bad row", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors[0]).toBe("DB error");
  });
});

// ── new_task routing ───────────────────────────────────────────────────

describe("applyPipPlan — new_task", function () {
  // Task-model unification: project tasks are folio_tasks rows now, so every
  // new_task routes through addItem (with project_id when project-bound).
  it("addItem loose task when project_id is missing", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "new_task", title: "Update slides", project_id: null, due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.addItem).toHaveBeenCalledOnce();
    expect(ctx.updateProject).not.toHaveBeenCalled();
    expect(ctx.addItem.mock.calls[0][0].project_id).toBe(null);
  });

  it("addItem with project_id + task_status + sort_order when project-bound", async function () {
    var project = { id: "proj-1", tasks: [], task_status_columns: ["intake", "in_progress"] };
    var ctx = makeCtx({ activeProjects: [project] });
    var selected = [{ idx: 0, row: { kind: "new_task", title: "Real task", project_id: "proj-1", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.updateProject).not.toHaveBeenCalled();
    expect(ctx.addItem).toHaveBeenCalledOnce();
    var call = ctx.addItem.mock.calls[0][0];
    expect(call.text).toBe("Real task");
    expect(call.project_id).toBe("proj-1");
    expect(call.task_status).toBe("intake");
    expect(call.sort_order).toBe(0);
  });

  it("preserves is_commitment on new_task→addItem", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "new_task", title: "Big commitment", project_id: null, due_date: null, assignee: null, recipient: null, is_commitment: true, target_account_id: null } }];
    await applyPipPlan(selected, ctx);
    var call = ctx.addItem.mock.calls[0][0];
    expect(call.is_commitment).toBe(true);
  });

  it("update_task routes to updateItem by task_id", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "update_task", task_id: "task-9", project_id: "proj-1", fields: { title: "Renamed" } } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.updateItem).toHaveBeenCalledWith("task-9", { title: "Renamed" });
  });

  it("update_task with no task_id records an error and does NOT call updateItem (no silent no-op)", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "update_task", task_id: null, project_id: "proj-1", fields: { title: "Orphan" } } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors[0]).toBeTruthy();
    expect(ctx.updateItem).not.toHaveBeenCalled();
  });
});

// ── close_item routing ─────────────────────────────────────────────────

describe("applyPipPlan — close_item", function () {
  it("calls closeItem with the target_id", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "close_item", target_id: "item-42" } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.closeItem).toHaveBeenCalledWith("item-42");
  });
});

// ── update_item routing ────────────────────────────────────────────────

describe("applyPipPlan — update_item", function () {
  it("calls updateItem with target_id and fields", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "update_item", target_id: "item-7", fields: { text: "Updated text" } } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.updateItem).toHaveBeenCalledWith("item-7", { text: "Updated text" });
  });
});

// ── batching — multiple new_task on same project ───────────────────────

describe("applyPipPlan — multiple tasks on same project", function () {
  it("inserts each as a folio_task with increasing sort_order", async function () {
    var project = { id: "proj-1", tasks: [], task_status_columns: ["intake"] };
    var ctx = makeCtx({ activeProjects: [project] });
    var selected = [
      { idx: 0, row: { kind: "new_task", title: "Task A", project_id: "proj-1", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } },
      { idx: 1, row: { kind: "new_task", title: "Task B", project_id: "proj-1", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } },
    ];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.addItem).toHaveBeenCalledTimes(2);
    expect(ctx.updateProject).not.toHaveBeenCalled();
    var orders = ctx.addItem.mock.calls.map(function (c) { return c[0].sort_order; }).sort();
    expect(orders).toEqual([0, 1]);
  });
});
