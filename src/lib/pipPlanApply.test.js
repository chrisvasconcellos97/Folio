import { describe, it, expect, vi } from "vitest";

// Stub out the Supabase-dependent hook so the module loads in test env.
vi.mock("../hooks/usePipAssignmentHints", function () {
  return {
    taskPattern: function (text) {
      return String(text || "").toLowerCase().trim().slice(0, 40);
    },
  };
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
  it("falls back to addItem when project_id is missing", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "new_task", title: "Update slides", project_id: null, due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.addItem).toHaveBeenCalledOnce();
    expect(ctx.updateProject).not.toHaveBeenCalled();
  });

  it("falls back to addItem when project_id is not in activeProjects", async function () {
    var ctx = makeCtx({ activeProjects: [{ id: "proj-999", stages: [], task_status_columns: [] }] });
    var selected = [{ idx: 0, row: { kind: "new_task", title: "Task for wrong project", project_id: "proj-404", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.addItem).toHaveBeenCalledOnce();
  });

  it("calls updateProject when project_id matches activeProjects", async function () {
    var project = { id: "proj-1", stages: [], task_status_columns: ["intake", "in_progress"] };
    var ctx = makeCtx({ activeProjects: [project] });
    var selected = [{ idx: 0, row: { kind: "new_task", title: "Real task", project_id: "proj-1", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } }];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.updateProject).toHaveBeenCalledOnce();
    var [pid, patch] = ctx.updateProject.mock.calls[0];
    expect(pid).toBe("proj-1");
    expect(patch.stages.length).toBe(1);
    expect(patch.stages[0].title).toBe("Real task");
  });

  it("preserves is_commitment on fallback new_task→addItem", async function () {
    var ctx = makeCtx();
    var selected = [{ idx: 0, row: { kind: "new_task", title: "Big commitment", project_id: null, due_date: null, assignee: null, recipient: null, is_commitment: true, target_account_id: null } }];
    await applyPipPlan(selected, ctx);
    var call = ctx.addItem.mock.calls[0][0];
    expect(call.is_commitment).toBe(true);
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
  it("batches into a single updateProject call", async function () {
    var project = { id: "proj-1", stages: [], task_status_columns: ["intake"] };
    var ctx = makeCtx({ activeProjects: [project] });
    var selected = [
      { idx: 0, row: { kind: "new_task", title: "Task A", project_id: "proj-1", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } },
      { idx: 1, row: { kind: "new_task", title: "Task B", project_id: "proj-1", due_date: null, assignee: null, recipient: null, is_commitment: false, target_account_id: null } },
    ];
    var result = await applyPipPlan(selected, ctx);
    expect(result.errors).toEqual({});
    expect(ctx.updateProject).toHaveBeenCalledOnce();
    var [, patch] = ctx.updateProject.mock.calls[0];
    expect(patch.stages.length).toBe(2);
  });
});
