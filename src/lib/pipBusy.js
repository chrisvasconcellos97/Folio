// Module-level busy counter for Pip API calls. lib/pip.js is a plain JS module
// with no access to React context, so it pings this shared emitter when a Pip
// network call starts/finishes. PipStateProvider subscribes and reflects the
// count into context → every <PipOrb> on screen flips to "thinking" while
// count > 0 and back to "idle" when it drops to zero.

var count = 0;
var listeners = new Set();

function notify() {
  listeners.forEach(function (l) { try { l(count); } catch (_) {} });
}

export function pipBusyStart() {
  count += 1;
  notify();
}

export function pipBusyEnd() {
  count = Math.max(0, count - 1);
  notify();
}

export function pipBusySubscribe(cb) {
  listeners.add(cb);
  try { cb(count); } catch (_) {}
  return function () { listeners.delete(cb); };
}

export function pipBusyCount() { return count; }
