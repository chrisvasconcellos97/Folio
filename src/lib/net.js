// Shared fetch helpers with timeout + abort.
//
// All non-supabase network calls in Folios should go through these so a
// flaky connection can't hang the UI forever. Calls in /lib/pip.js have
// their own copy of fetchWithTimeout (kept intentionally — Pip has retry
// semantics tied to its own error shape).
//
// fetchWithTimeout — wraps fetch with an AbortController + timeout.
// Throws "timeout" Error on timeout, original error otherwise.
//
// fetchJSON — convenience: fetch + parse JSON + throw on non-2xx.
//
// withRetry — retry a promise factory once on failure with a small backoff.
// Intended for idempotent reads (geocoding, pip-state-refresh).

export var DEFAULT_TIMEOUT_MS = 15000;

export function fetchWithTimeout(url, options, timeoutMs) {
  var ms = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_TIMEOUT_MS;
  var controller = new AbortController();
  var timedOut = false;
  var timer = setTimeout(function () { timedOut = true; controller.abort(); }, ms);
  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .then(function (res) { clearTimeout(timer); return res; })
    .catch(function (err) {
      clearTimeout(timer);
      if (timedOut) {
        var e = new Error("timeout");
        e.code = "TIMEOUT";
        throw e;
      }
      throw err;
    });
}

export function fetchJSON(url, options, timeoutMs) {
  return fetchWithTimeout(url, options, timeoutMs).then(function (res) {
    if (!res.ok) {
      var e = new Error("HTTP " + res.status);
      e.status = res.status;
      throw e;
    }
    return res.json();
  });
}

// withRetry(factory, { retries=1, backoffMs=2000, shouldRetry })
// Runs factory(), retries once after backoff if shouldRetry(err) is truthy
// (default: only retry on TIMEOUT / 5xx / network).
export function withRetry(factory, opts) {
  opts = opts || {};
  var retries   = typeof opts.retries === "number" ? opts.retries : 1;
  var backoffMs = typeof opts.backoffMs === "number" ? opts.backoffMs : 2000;
  var shouldRetry = opts.shouldRetry || function (err) {
    if (!err) return false;
    if (err.code === "TIMEOUT") return true;
    if (err.name === "TypeError") return true; // network error
    if (typeof err.status === "number" && err.status >= 500) return true;
    return false;
  };

  function attempt(remaining) {
    return factory().catch(function (err) {
      if (remaining > 0 && shouldRetry(err)) {
        return new Promise(function (r) { setTimeout(r, backoffMs); })
          .then(function () { return attempt(remaining - 1); });
      }
      throw err;
    });
  }
  return attempt(retries);
}
