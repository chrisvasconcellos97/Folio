import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

// ─── Phase 8 — Multi-device realtime sync ───────────────────────────────────
// Subscribes the calling hook to postgres_changes on a single table, filtered
// to rows owned by `userId` so a client never receives another user's events.
// On INSERT / UPDATE / DELETE the consumer's `onChange` callback fires.
//
// Consumers (the main data hooks) pass `refetch` as `onChange` and let this
// hook debounce a burst of changes into one refetch — so 10 inserts in 100ms
// hit Supabase once, not 10 times.
//
// Best-effort: if Realtime is unreachable we report status but don't crash.
// The status broadcast lets a discreet "Reconnecting…" indicator render
// without each consumer wiring its own listener.
//
// Cleanup: every channel is removed on unmount. Visibility-change rebinds
// the channel because iOS Safari aggressively closes websockets on hidden
// tabs — without this, a backgrounded PWA would silently stop syncing.
// ─────────────────────────────────────────────────────────────────────────────

var DEBOUNCE_MS = 500;

// Global connection-status broadcaster. ConnectionStatus.jsx listens here.
// Map<channelKey, status>. Status: 'idle' | 'subscribed' | 'closed' | 'channel_error' | 'timed_out'.
var statusByChannel = {};
var statusListeners = [];

function publishStatus(key, status) {
  statusByChannel[key] = status;
  for (var i = 0; i < statusListeners.length; i++) {
    try { statusListeners[i](statusByChannel); } catch (e) { /* swallow */ }
  }
}

export function subscribeRealtimeStatus(listener) {
  statusListeners.push(listener);
  // Push current snapshot immediately so late subscribers aren't blind.
  try { listener(statusByChannel); } catch (e) { /* swallow */ }
  return function unsubscribe() {
    var idx = statusListeners.indexOf(listener);
    if (idx !== -1) statusListeners.splice(idx, 1);
  };
}

// True if at least one channel has ever subscribed AND no channel is in a
// failure state. Used by the indicator to decide "show reconnecting".
export function isRealtimeHealthy() {
  var anySubscribed = false;
  var anyBroken = false;
  var keys = Object.keys(statusByChannel);
  for (var i = 0; i < keys.length; i++) {
    var s = statusByChannel[keys[i]];
    if (s === "subscribed") anySubscribed = true;
    if (s === "closed" || s === "channel_error" || s === "timed_out") anyBroken = true;
  }
  // If nothing has ever subscribed we can't claim broken — return healthy.
  if (!anySubscribed && !anyBroken) return true;
  return !anyBroken;
}

export function useRealtimeSync(table, userId, onChange) {
  var debounceRef = useRef(null);
  var onChangeRef = useRef(onChange);
  // Per-mount unique suffix so two hooks subscribing to the same (table,userId)
  // — e.g. useProjects called from both GaugeView (no accountId) and
  // AccountDetail (per-account) — don't collide on a shared channel and trip
  // Supabase's "cannot add callbacks after subscribe()" error.
  var instanceRef = useRef(null);
  if (instanceRef.current === null) {
    instanceRef.current = Math.random().toString(36).slice(2, 10);
  }
  // Keep latest callback without resubscribing — resubscribes blow away the
  // channel and would cause connect/disconnect churn on every refetch.
  useEffect(function () { onChangeRef.current = onChange; }, [onChange]);

  useEffect(function () {
    if (!userId || !table) return;

    var channelKey = "rt:" + table + ":" + userId + ":" + instanceRef.current;
    publishStatus(channelKey, "idle");

    function fireDebounced(payload) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(function () {
        debounceRef.current = null;
        try {
          if (typeof onChangeRef.current === "function") onChangeRef.current(payload);
        } catch (e) {
          // Swallow — a consumer's refetch should never tear down the sub.
          console.warn("[realtime] onChange threw:", e);
        }
      }, DEBOUNCE_MS);
    }

    var channel = supabase
      .channel(channelKey)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: table,
          filter: "user_id=eq." + userId,
        },
        fireDebounced
      )
      .subscribe(function (status) {
        // status is one of: 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'
        var normalized = String(status || "").toLowerCase();
        publishStatus(channelKey, normalized);
      });

    // Visibility rebind: when the tab returns to foreground, if our channel
    // dropped while hidden we need to reconnect. Cheapest reliable path is to
    // tear down and re-create the channel; Supabase's reconnect logic is
    // unreliable on mobile Safari background.
    function handleVisibility() {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      var current = statusByChannel[channelKey];
      if (current === "subscribed") return; // healthy, no action
      // Force resubscribe.
      try { supabase.removeChannel(channel); } catch (e) { /* swallow */ }
      channel = supabase
        .channel(channelKey)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: table,
            filter: "user_id=eq." + userId,
          },
          fireDebounced
        )
        .subscribe(function (status) {
          var normalized = String(status || "").toLowerCase();
          publishStatus(channelKey, normalized);
        });
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return function cleanup() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
      try { supabase.removeChannel(channel); } catch (e) { /* swallow */ }
      delete statusByChannel[channelKey];
      // Notify listeners that this channel went away.
      for (var i = 0; i < statusListeners.length; i++) {
        try { statusListeners[i](statusByChannel); } catch (e) { /* swallow */ }
      }
    };
  }, [table, userId]);
}
