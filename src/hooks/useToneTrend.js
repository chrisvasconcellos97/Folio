// Pip Tier B — tone temperature trend from folio_account_snapshots.
// Returns the last N pip_tone values for an account + a derived trend signal.

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

var LOOKBACK = 14; // days

export function useToneTrend(userId, accountId) {
  var [toneHistory, setToneHistory] = useState([]);
  var [trend, setTrend] = useState(null); // 'cooling' | 'warming' | 'stable' | null

  useEffect(function () {
    if (!userId || !accountId) return;
    var cutoff = new Date(Date.now() - LOOKBACK * 86400000).toISOString().slice(0, 10);
    supabase
      .from("folio_account_snapshots")
      .select("snapshot_date, pip_tone")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .gte("snapshot_date", cutoff)
      .not("pip_tone", "is", null)
      .order("snapshot_date", { ascending: true })
      .then(function (r) {
        if (r.error || !r.data || r.data.length < 3) {
          setToneHistory([]);
          setTrend(null);
          return;
        }
        var tones = r.data.map(function (s) { return s.pip_tone; });
        setToneHistory(tones);
        setTrend(deriveTrend(tones));
      });
  }, [userId, accountId]);

  return { toneHistory: toneHistory, trend: trend };
}

// Match actual pip_tone values stored in folio_account_snapshots.
// Stored values: "positive" | "neutral" | "mixed" | "negative"
// "mixed" scores as mild negative so a string of mixed tones shows as cooling.
var NEGATIVE = ["negative", "mixed"];
var POSITIVE  = ["positive"];

function score(tone) {
  if (!tone) return 0;
  var t = tone.toLowerCase();
  if (POSITIVE.some(function (p) { return t.includes(p); })) return 1;
  if (NEGATIVE.some(function (n) { return t.includes(n); })) return -1;
  return 0;
}

function deriveTrend(tones) {
  if (tones.length < 3) return null;
  var recent = tones.slice(-3).map(score);
  var older  = tones.slice(0, -3).map(score);
  var recentAvg = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
  var olderAvg  = older.length > 0 ? older.reduce(function (a, b) { return a + b; }, 0) / older.length : 0;
  if (recentAvg < -0.3) return "cooling";
  if (recentAvg > 0.3 && recentAvg > olderAvg + 0.3) return "warming";
  return "stable";
}
