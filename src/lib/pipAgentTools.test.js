import { describe, it, expect } from "vitest";
import {
  PIP_READ_TOOLS,
  isReadTool,
  partitionToolUses,
  decideLoopStep,
  buildToolResultBlocks,
} from "./pipAgentTools.js";

describe("PIP_READ_TOOLS shape", () => {
  it("every read tool has name, description, and an object input_schema with required[]", () => {
    expect(PIP_READ_TOOLS.length).toBeGreaterThan(0);
    PIP_READ_TOOLS.forEach((t) => {
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
      expect(t.input_schema && t.input_schema.type).toBe("object");
      expect(Array.isArray(t.input_schema.required)).toBe(true);
    });
  });

  it("includes the v1 read trio", () => {
    var names = PIP_READ_TOOLS.map((t) => t.name);
    expect(names).toContain("lookup_account");
    expect(names).toContain("find_open_work");
    expect(names).toContain("search_notes");
  });

  it("descriptions never solicit numbers (Data Line Rule)", () => {
    PIP_READ_TOOLS.forEach((t) => {
      expect(t.description.toLowerCase()).not.toMatch(/revenue|dollar|how many|count of|number of shops|pricing/);
    });
  });
});

describe("isReadTool", () => {
  it("classifies read tools as read", () => {
    expect(isReadTool("lookup_account")).toBe(true);
    expect(isReadTool("find_open_work")).toBe(true);
    expect(isReadTool("search_notes")).toBe(true);
  });
  it("classifies existing action/open/navigate tools as NOT read", () => {
    ["log_meeting", "create_open_item", "open_meeting", "navigate", "complete_task", "remember_fact"].forEach((n) => {
      expect(isReadTool(n)).toBe(false);
    });
    expect(isReadTool(undefined)).toBe(false);
  });
});

describe("partitionToolUses", () => {
  it("splits a mixed content array into read / action / text", () => {
    var content = [
      { type: "text", text: "Let me check that." },
      { type: "tool_use", id: "t1", name: "find_open_work", input: { filter: "stalled" } },
      { type: "tool_use", id: "t2", name: "log_meeting", input: { account_id: "a" } },
    ];
    var p = partitionToolUses(content);
    expect(p.hasText).toBe(true);
    expect(p.readTools.map((t) => t.name)).toEqual(["find_open_work"]);
    expect(p.actionTools.map((t) => t.name)).toEqual(["log_meeting"]);
    expect(p.readTools[0]).toEqual({ id: "t1", name: "find_open_work", input: { filter: "stalled" } });
  });

  it("handles text-only and empty content", () => {
    expect(partitionToolUses([{ type: "text", text: "hi" }])).toEqual({ readTools: [], actionTools: [], hasText: true });
    expect(partitionToolUses(null)).toEqual({ readTools: [], actionTools: [], hasText: false });
  });

  it("defaults missing tool input to {}", () => {
    var p = partitionToolUses([{ type: "tool_use", id: "x", name: "search_notes" }]);
    expect(p.readTools[0].input).toEqual({});
  });
});

describe("decideLoopStep", () => {
  function mk(readN, actionN) {
    return {
      readTools: Array.from({ length: readN }, (_, i) => ({ id: "r" + i, name: "find_open_work" })),
      actionTools: Array.from({ length: actionN }, (_, i) => ({ id: "a" + i, name: "log_meeting" })),
    };
  }

  it("continues on a pure read-only turn with steps remaining", () => {
    expect(decideLoopStep({ partition: mk(1, 0), step: 0, maxSteps: 4 })).toBe("continue");
    expect(decideLoopStep({ partition: mk(2, 0), step: 1, maxSteps: 4 })).toBe("continue");
  });

  it("terminates when an action tool is present (action wins — no dangling tool_use)", () => {
    expect(decideLoopStep({ partition: mk(1, 1), step: 0, maxSteps: 4 })).toBe("terminate");
    expect(decideLoopStep({ partition: mk(0, 1), step: 0, maxSteps: 4 })).toBe("terminate");
  });

  it("terminates when there are no tools at all (plain text answer)", () => {
    expect(decideLoopStep({ partition: mk(0, 0), step: 0, maxSteps: 4 })).toBe("terminate");
  });

  it("forces a final answer on the last allowed step", () => {
    expect(decideLoopStep({ partition: mk(1, 0), step: 3, maxSteps: 4 })).toBe("force_final");
    expect(decideLoopStep({ partition: mk(1, 0), step: 0, maxSteps: 1 })).toBe("force_final");
  });

  it("NO-REGRESSION LOCK: an action-only turn never continues the loop", () => {
    for (var step = 0; step < 4; step++) {
      expect(decideLoopStep({ partition: mk(0, 1), step: step, maxSteps: 4 })).not.toBe("continue");
    }
  });
});

describe("buildToolResultBlocks", () => {
  it("wraps results as tool_result blocks, flagging errors", () => {
    var blocks = buildToolResultBlocks([
      { tool_use_id: "t1", content: "ok" },
      { tool_use_id: "t2", content: "boom", is_error: true },
    ]);
    expect(blocks[0]).toEqual({ type: "tool_result", tool_use_id: "t1", content: "ok" });
    expect(blocks[1]).toEqual({ type: "tool_result", tool_use_id: "t2", content: "boom", is_error: true });
  });

  it("stringifies non-string content", () => {
    var blocks = buildToolResultBlocks([{ tool_use_id: "t1", content: { a: 1 } }]);
    expect(blocks[0].content).toBe('{"a":1}');
  });
});
