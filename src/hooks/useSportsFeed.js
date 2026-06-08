import { useState, useEffect, useCallback } from "react";

// useSportsFeed — Chris's "off the clock" card data: soccer news + scores from
// /api/sports. Client-cached in localStorage so navigating around doesn't
// refetch; the server caches too. Best-effort — errors just yield empty.
var LS_KEY = "folio_sports_cache_v1";
var CLIENT_TTL = 5 * 60 * 1000; // 5 min client cache

export function useSportsFeed(enabled) {
  var [data, setData]       = useState(null);
  var [loading, setLoading] = useState(false);

  var fetchFeed = useCallback(function (force) {
    if (!enabled) return;
    // Client cache.
    if (!force) {
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) {
          var c = JSON.parse(raw);
          if (c && c.at && Date.now() - c.at < CLIENT_TTL && c.payload) {
            setData(c.payload);
            return;
          }
        }
      } catch (_) { /* ignore */ }
    }
    setLoading(true);
    fetch("/api/sports")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) {
        setLoading(false);
        if (!p) return;
        setData(p);
        try { localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), payload: p })); } catch (_) { /* ignore */ }
      })
      .catch(function () { setLoading(false); });
  }, [enabled]);

  useEffect(function () { fetchFeed(false); }, [fetchFeed]);

  return { data: data, loading: loading, refetch: function () { fetchFeed(true); } };
}
