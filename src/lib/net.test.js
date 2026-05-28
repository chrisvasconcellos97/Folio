import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithTimeout, fetchJSON, withRetry } from "./net";

describe("fetchWithTimeout", function () {
  beforeEach(function () { vi.useFakeTimers(); });
  afterEach(function () { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("returns response on success", async function () {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    var p = fetchWithTimeout("/x", {}, 5000);
    var res = await p;
    expect(res.ok).toBe(true);
  });

  it("throws timeout error when slow", async function () {
    globalThis.fetch = vi.fn(function (_url, opts) {
      // Honor abort signal so the catch path fires when controller.abort runs.
      return new Promise(function (_resolve, reject) {
        opts.signal.addEventListener("abort", function () {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    var p = fetchWithTimeout("/x", {}, 50);
    vi.advanceTimersByTime(100);
    await expect(p).rejects.toThrow("timeout");
  });
});

describe("fetchJSON", function () {
  it("parses JSON on 200", async function () {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: function () { return Promise.resolve({ a: 1 }); },
    });
    var j = await fetchJSON("/x");
    expect(j.a).toBe(1);
  });

  it("throws with status on non-2xx", async function () {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    var threw = null;
    try { await fetchJSON("/x"); } catch (e) { threw = e; }
    expect(threw).not.toBeNull();
    expect(threw.status).toBe(500);
  });
});

describe("withRetry", function () {
  it("retries once on transient failure", async function () {
    var n = 0;
    var factory = function () {
      n++;
      if (n === 1) {
        var e = new Error("timeout"); e.code = "TIMEOUT"; return Promise.reject(e);
      }
      return Promise.resolve("ok");
    };
    var res = await withRetry(factory, { retries: 1, backoffMs: 1 });
    expect(res).toBe("ok");
    expect(n).toBe(2);
  });

  it("does not retry on non-transient failure", async function () {
    var n = 0;
    var factory = function () {
      n++;
      var e = new Error("nope"); e.status = 400; return Promise.reject(e);
    };
    var threw = null;
    try { await withRetry(factory, { retries: 1, backoffMs: 1 }); } catch (e) { threw = e; }
    expect(threw).not.toBeNull();
    expect(n).toBe(1);
  });
});
