import { describe, it, expect, vi, beforeEach } from "vitest";

// projectTasks.js (pulled in for stageToTaskFields) imports supabase, which runs
// createClient at module load — stub it so the test env doesn't need env vars.
vi.mock("./supabase", function () {
  return { supabase: { from: function () { return {}; } } };
});

// Mock the folio_tasks write helpers. insertTask returns the row WITH an id
// (mirrors the real .insert().select().single()).
var seq = 0;
vi.mock("../hooks/useTasks", function () {
  return {
    insertTask: vi.fn(function (uid, payload) {
      seq += 1;
      return Promise.resolve(Object.assign({ id: "new-" + seq }, payload));
    }),
    updateTask: vi.fn(function () { return Promise.resolve(); }),
    deleteTask: vi.fn(function () { return Promise.resolve(); }),
  };
});

import { reconcileProjectTasks } from "./projectTaskWrites";
import { insertTask, updateTask, deleteTask } from "../hooks/useTasks";

function proj(id) {
  return { id: id, account_id: "a1", status: "planned", task_status_columns: [{ id: "intake" }] };
}

beforeEach(function () {
  seq = 0;
  insertTask.mockClear(); updateTask.mockClear(); deleteTask.mockClear();
});

describe("reconcileProjectTasks — the triplication fix", function () {
  it("inserts a brand-new task and returns it carrying a real id", async function () {
    var resolved = await reconcileProjectTasks("u1", proj("p1"), [{ title: "test" }], []);
    expect(insertTask).toHaveBeenCalledTimes(1);
    expect(updateTask).not.toHaveBeenCalled();
    expect(resolved[0].id).toBeTruthy(); // editor adopts this so the next edit matches
  });

  it("UPDATES an edited task by id instead of re-inserting (create→edit must not duplicate)", async function () {
    var resolved = await reconcileProjectTasks(
      "u1", proj("p2"),
      [{ id: "X", title: "testing" }],   // next: renamed
      [{ id: "X", title: "test" }]       // current: editor's pre-mutation view
    );
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(insertTask).not.toHaveBeenCalled();
    expect(resolved[0].id).toBe("X");
  });

  it("completing a task updates in place (no third row)", async function () {
    await reconcileProjectTasks(
      "u1", proj("p3"),
      [{ id: "X", title: "testing", completed_at: "2026-06-18T00:00:00Z" }],
      [{ id: "X", title: "testing" }]
    );
    expect(updateTask).toHaveBeenCalledTimes(1);
    expect(insertTask).not.toHaveBeenCalled();
  });

  it("does NOT delete tasks the editor still shows (no spurious delete)", async function () {
    await reconcileProjectTasks(
      "u1", proj("p4"),
      [{ id: "X" }, { id: "Y" }],
      [{ id: "X" }, { id: "Y" }]
    );
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it("deletes only a task removed from the editor view", async function () {
    await reconcileProjectTasks("u1", proj("p5"), [{ id: "X" }], [{ id: "X" }, { id: "Y" }]);
    expect(deleteTask).toHaveBeenCalledTimes(1);
  });
});
