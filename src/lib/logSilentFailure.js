// logSilentFailure — shared helper for promise .catch() blocks that would
// otherwise be silently empty.
//
// Usage:
//   somePromise.catch(function (err) { logSilentFailure("useFoo/bar", err); });
//
// Best-effort: never throws, never blocks the caller. Writes to folio_errors
// via the shared errorLog module (which itself is rate-limited and deduplicated)
// and emits a console.error so the issue shows up in Vercel / browser DevTools.
//
// This is the alternative to `.catch(function () {})` for cases where failure
// is acceptable to swallow UI-side but should still be observable. The Guard 1
// CI check enforces that new empty catches don't appear — use this instead.
//
// For truly intentional no-ops (clipboard, version-check fetches, best-effort
// fire-and-forget where the error is expected and meaningless), use the guard-ok
// allowlist comment instead: .catch(function () { /* guard-ok: reason */ })

export function logSilentFailure(where, err) {
  var msg = (err && (err.message || String(err))) || "unknown error";
  // Always emit to console so it surfaces in Vercel logs and browser DevTools.
  console.error("[silent-failure] " + where + ":", msg);
  // Best-effort insert into folio_errors via the shared errorLog module.
  // Dynamic import so this file is safe to import in test environments.
  try {
    import("./errorLog.js").then(function (m) {
      if (m && m.logError) {
        m.logError("silent-failure", where + ": " + msg, { context: { where: where } });
      }
    }).catch(function () { /* guard-ok: meta-failure logging must never throw */ });
  } catch (metaErr) {
    // Truly swallow — we are already in an error path.
  }
}
