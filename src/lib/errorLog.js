// Client-side error capture — writes to folio_errors via RLS-scoped insert.
//
// Best-effort: every call is fire-and-forget and swallows any failure from the
// network/Supabase side. Logging errors must never block, throw, or cascade
// into another error — if it did, a render error could trigger a render error
// trying to log itself and so on.
//
// Rate-limited two ways:
//   1. Hard cap of 20 inserts per rolling minute (in-memory counter).
//   2. Message-hash dedupe: identical messages within a 60s window get
//      collapsed to a single row.
//
// Both guards are intentionally process-local — the table itself has no rate
// limit, so a runaway render-error loop without these guards would slam the
// database and burn the RLS quota.

// Supabase is loaded lazily so this module is importable in test environments
// without VITE_SUPABASE_URL set (e.g. net.test.js). The lazy load also keeps
// the unit cost of importing errorLog tiny — it only touches Supabase when an
// error actually fires.
function getSupabase() {
  return import("./supabase").then(function (m) { return m.supabase; });
}

var MAX_ERRORS_PER_MINUTE = 20;
var DEDUPE_WINDOW_MS = 60 * 1000;

var minuteCounter = { windowStart: 0, count: 0 };
var recentHashes = new Map(); // hash -> timestamp

function hashMessage(type, message) {
  // Tiny non-cryptographic hash — collisions are fine here, we only need
  // "same-shape error" detection within a 60-second window.
  var s = (type || "") + "|" + (message || "");
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function withinRateLimit() {
  var now = Date.now();
  if (now - minuteCounter.windowStart > 60 * 1000) {
    minuteCounter.windowStart = now;
    minuteCounter.count = 0;
  }
  if (minuteCounter.count >= MAX_ERRORS_PER_MINUTE) return false;
  minuteCounter.count += 1;
  return true;
}

function isDuplicate(hash) {
  var now = Date.now();
  // Garbage-collect old hashes opportunistically.
  if (recentHashes.size > 100) {
    recentHashes.forEach(function (ts, key) {
      if (now - ts > DEDUPE_WINDOW_MS) recentHashes.delete(key);
    });
  }
  var seen = recentHashes.get(hash);
  if (seen && now - seen < DEDUPE_WINDOW_MS) return true;
  recentHashes.set(hash, now);
  return false;
}

function safeStringify(obj) {
  if (!obj) return null;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    try { return { _stringify_failed: String(e) }; } catch (_) { return null; }
  }
}

/**
 * Log an error to folio_errors. Never throws, never blocks.
 *
 * @param {string} type     'react' | 'network' | 'pip' | 'unhandled' | 'rejection'
 * @param {string} message  short error message
 * @param {Object} [opts]   { stack?, context? }
 * @returns {Promise<{ id: string }|null>} resolves with inserted row id or null
 */
export function logError(type, message, opts) {
  opts = opts || {};
  try {
    var msg = message != null ? String(message).slice(0, 2000) : "(no message)";
    var hash = hashMessage(type, msg);

    if (isDuplicate(hash)) return Promise.resolve(null);
    if (!withinRateLimit())   return Promise.resolve(null);

    var sourceUrl = "";
    var userAgent = "";
    try { sourceUrl = window.location ? window.location.pathname : ""; } catch (e) { /* swallow */ }
    try { userAgent = (navigator && navigator.userAgent) || ""; } catch (e) { /* swallow */ }

    var row = {
      error_type: String(type || "unhandled"),
      message:    msg,
      stack:      opts.stack ? String(opts.stack).slice(0, 8000) : null,
      source_url: sourceUrl || null,
      user_agent: userAgent || null,
      context:    safeStringify(opts.context),
    };

    return getSupabase().then(function (supabase) {
      return supabase.auth.getSession()
        .then(function (result) {
          var uid = result && result.data && result.data.session && result.data.session.user && result.data.session.user.id;
          if (!uid) return null;
          row.user_id = uid;
          return supabase.from("folio_errors").insert([row]).select("id").single().then(function (r) {
            if (r && r.error) {
              try { console.warn("[errorLog] insert failed:", r.error.message); } catch (_) { /* swallow */ }
              return null;
            }
            return r && r.data ? { id: r.data.id } : null;
          }, function () { return null; });
        }, function () { return null; });
    }).catch(function () { return null; });
  } catch (e) {
    // Absolute last-resort: never let logError throw.
    try { console.warn("[errorLog] swallowed:", e); } catch (_) { /* swallow */ }
    return Promise.resolve(null);
  }
}

/**
 * Wires window.onerror and unhandledrejection handlers. Idempotent — safe to
 * call once at app startup.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;
  if (window.__folioErrorHandlersInstalled) return;
  window.__folioErrorHandlersInstalled = true;

  window.addEventListener("error", function (e) {
    var msg = e && e.message ? e.message : "Unhandled error";
    var stack = e && e.error && e.error.stack ? e.error.stack : null;
    logError("unhandled", msg, { stack: stack, context: { filename: e && e.filename, line: e && e.lineno } });
  });

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    var msg = "Unhandled promise rejection";
    var stack = null;
    if (reason) {
      if (typeof reason === "string") msg = reason;
      else if (reason.message) msg = reason.message;
      stack = reason.stack || null;
    }
    logError("rejection", msg, { stack: stack });
  });
}

/**
 * Append user-provided context to an existing error row (used by the "Tell me
 * what happened" textarea in the ErrorBoundary fallback). Best-effort.
 */
export function appendErrorNote(errorId, note) {
  if (!errorId || !note) return Promise.resolve(null);
  try {
    return getSupabase().then(function (supabase) {
      return supabase.from("folio_errors").select("context").eq("id", errorId).single()
        .then(function (r) {
          var ctx = (r && r.data && r.data.context) || {};
          ctx.user_note = String(note).slice(0, 2000);
          return supabase.from("folio_errors").update({ context: ctx }).eq("id", errorId).then(function () { return true; });
        })
        .catch(function () { return false; });
    }).catch(function () { return false; });
  } catch (e) {
    return Promise.resolve(false);
  }
}
