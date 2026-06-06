// Page-level chaos: capture console errors, network failures, page crashes.
// Anything that fires here counts as a "passive failure" — the bot didn't
// trigger it directly but the app emitted it.

export function attachPageWatchers(page, onIssue) {
  page.on("pageerror", (err) => {
    // Prefer the full stack — it carries the asset:line:col frames the
    // source-map decoder needs to point at a real src/ file. Fall back to
    // the plain message if no stack is present.
    const message = (err && err.stack) ? err.stack : String(err);
    onIssue({ kind: "pageerror", message });
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter out known noise — service worker / vite HMR messages.
      if (
        text.includes("workbox") ||
        text.includes("[vite]") ||
        text.includes("HMR")
      ) return;
      onIssue({ kind: "console.error", message: text });
    }
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    // Skip 3rd-party noise (analytics, fonts, etc).
    if (!url.includes(new URL(page.url() || "http://x").host)) return;
    const err = req.failure()?.errorText || "";
    // Ignore navigation-aborted/cancelled requests — these are caused by the
    // fuzzer switching views mid-flight (it cancels its own in-flight loads),
    // not by the app failing. They were the bulk of the false "passive issues".
    if (/ERR_ABORTED|ERR_CANCEL|cancell?ed|aborted/i.test(err)) return;
    onIssue({
      kind: "requestfailed",
      message: `${req.method()} ${url} — ${err}`,
    });
  });

  page.on("response", (res) => {
    if (res.status() >= 500) {
      onIssue({
        kind: "5xx",
        message: `${res.status()} ${res.request().method()} ${res.url()}`,
      });
    }
  });

  page.on("crash", () => {
    onIssue({ kind: "crash", message: "page crashed" });
  });
}
