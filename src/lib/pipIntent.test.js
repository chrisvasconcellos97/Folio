import { describe, it, expect } from "vitest";
import { classifyIntent } from "./pipIntent";

var sampleAccounts = [
  { id: "a1", name: "KSI Auto Parts" },
  { id: "a2", name: "All Star Auto" },
  { id: "a3", name: "LKQ" },
];

var sampleContext = {
  accounts: sampleAccounts,
  openItems: [
    { id: "i1", text: "Send report", due_date: "2020-01-01", done: false },
    { id: "i2", text: "Confirm date", due_date: "2099-12-31", done: false },
    { id: "i3", text: "Done thing", done: true },
  ],
  meetings: [
    { id: "m1", account_id: "a1", meeting_date: "2026-04-12", title: "Q1 review" },
    { id: "m2", account_id: "a1", meeting_date: "2026-03-15", title: "Kickoff" },
  ],
};

describe("classifyIntent", function () {
  it("greets deterministically", function () {
    var out = classifyIntent("hey", sampleContext);
    expect(out.mode).toBe("chat");
    expect(out.deterministicAnswer).toBeTruthy();
  });

  it("acks 'thanks' deterministically", function () {
    var out = classifyIntent("thanks!", sampleContext);
    expect(out.deterministicAnswer).toBeTruthy();
  });

  it("answers overdue count from data", function () {
    var out = classifyIntent("how many overdue items?", sampleContext);
    expect(out.mode).toBe("chat");
    expect(out.deterministicAnswer).toMatch(/1\b/);
  });

  it("answers account count from data", function () {
    var out = classifyIntent("how many accounts do I have?", sampleContext);
    expect(out.deterministicAnswer).toMatch(/3/);
  });

  it("answers last meeting lookup deterministically when unambiguous", function () {
    var out = classifyIntent("when did I last meet with KSI?", sampleContext);
    expect(out.deterministicAnswer).toMatch(/KSI|2026-04-12/);
  });

  it("routes 'mark X done' to action mode", function () {
    var out = classifyIntent("mark that report as done", sampleContext);
    expect(out.mode).toBe("action");
  });

  it("routes 'brief me on LKQ' to brief mode", function () {
    var out = classifyIntent("brief me on LKQ before the call", sampleContext);
    expect(out.mode).toBe("brief");
  });

  it("routes a summarize request that names an account to summary mode", function () {
    // Summary mode strips Pip's persona and expects JSON, so it only fires when
    // the message references a known account (mentionsAccount gate).
    var out = classifyIntent("summarize what came out of last week with KSI Auto Parts", sampleContext);
    expect(out.mode).toBe("summary");
  });

  it("keeps a bare 'summarize this' (no account named) in chat mode", function () {
    var out = classifyIntent("summarize what came out of last week", sampleContext);
    expect(out.mode).toBe("chat");
  });

  it("falls through to chat for general questions", function () {
    var out = classifyIntent("what should I focus on this week?", sampleContext);
    expect(out.mode).toBe("chat");
    expect(out.deterministicAnswer).toBeUndefined();
  });
});
