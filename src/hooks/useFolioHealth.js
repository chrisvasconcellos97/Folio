// "Is Folios earning its keep?" — a read-only health rollup for the Settings
// dashboard. Reads three tables you already have (no new tracking, no writes,
// no Pip calls) and computes:
//   • feed       — are you actually putting your world into it?
//   • accuracy   — how often is Pip wrong enough that you correct it? (trend)
//   • canary     — has a Pip surface gone silent? (the dead-surface class)
//   • cost       — spend over 30d, top spender, week-over-week direction
//
// Every source fails SOFT — a missing/empty table renders as "—", never breaks
// the Settings page. Account stats (touched / cold) are computed by the caller
// from the accounts already in memory, so this hook owns only the DB reads.

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

var DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d) {
  // Local-day bucket key (YYYY-M-D) for distinct-days counting.
  var dt = new Date(d);
  return dt.getFullYear() + "-" + dt.getMonth() + "-" + dt.getDate();
}

export function useFolioHealth(userId) {
  var [data, setData]       = useState(null);
  var [loading, setLoading] = useState(false);

  useEffect(function () {
    if (!userId) return;
    var cancelled = false;
    setLoading(true);

    var now    = Date.now();
    var d7     = new Date(now - 7 * DAY_MS).toISOString();
    var d14    = new Date(now - 14 * DAY_MS).toISOString();
    var d28    = new Date(now - 28 * DAY_MS).toISOString();
    var d30    = new Date(now - 30 * DAY_MS).toISOString();

    var usageQ = supabase
      .from("folio_pip_usage")
      .select("endpoint, cost_micro_cents, created_at")
      .eq("user_id", userId)
      .gte("created_at", d30)
      .limit(8000);

    var corrQ = supabase
      .from("pip_correction_log")
      .select("correction_type, meeting_id, created_at")
      .eq("user_id", userId)
      .gte("created_at", d28)
      .limit(3000);

    var meetQ = supabase
      .from("folio_meetings")
      .select("meeting_date, status, created_at")
      .eq("user_id", userId)
      .gte("created_at", d30)
      .limit(2000);

    Promise.all([usageQ, corrQ, meetQ]).then(function (res) {
      if (cancelled) return;
      var usageRows = (res[0] && !res[0].error && res[0].data) || [];
      var corrRows  = (res[1] && !res[1].error && res[1].data) || [];
      var meetRows  = (res[2] && !res[2].error && res[2].data) || [];

      // ── Cost (30d) ──────────────────────────────────────────────
      var usd30 = 0, thisWeek = 0, prevWeek = 0;
      var byEndpointMicro = {};
      var lastSeen = {};   // endpoint -> latest ms
      usageRows.forEach(function (r) {
        var micro = r.cost_micro_cents || 0;
        var t = new Date(r.created_at).getTime();
        usd30 += micro;
        byEndpointMicro[r.endpoint] = (byEndpointMicro[r.endpoint] || 0) + micro;
        if (r.created_at >= d7) thisWeek += micro;
        else if (r.created_at >= d14) prevWeek += micro;
        if (!lastSeen[r.endpoint] || t > lastSeen[r.endpoint]) lastSeen[r.endpoint] = t;
      });
      var byEndpoint = Object.keys(byEndpointMicro)
        .map(function (e) { return { endpoint: e, usd: byEndpointMicro[e] / 1e6 }; })
        .sort(function (a, b) { return b.usd - a.usd; });

      // ── Canary: operator-run is the daily cron — its silence is the
      // meaningful signal. Only flag surfaces we actually saw run in the
      // window (avoids false "dead" claims about never-used endpoints).
      var canary = [];
      if (lastSeen["operator-run"]) {
        var opDays = Math.floor((now - lastSeen["operator-run"]) / DAY_MS);
        if (opDays >= 3) canary.push({ label: "Pip's operator pass", days: opDays });
      }

      // ── Accuracy (corrections) ──────────────────────────────────
      var corr14 = 0, corrPrev14 = 0;
      var byType = {};
      var meetingsCorrected = {};
      corrRows.forEach(function (r) {
        if (r.created_at >= d14) {
          corr14++;
          byType[r.correction_type] = (byType[r.correction_type] || 0) + 1;
          if (r.meeting_id) meetingsCorrected[r.meeting_id] = true;
        } else if (r.created_at >= d28) {
          corrPrev14++;
        }
      });
      var topType = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; })[0] || null;

      // ── Feed (14d) + summarized (30d) ───────────────────────────
      var feedDayKeys = {};
      var meetings14 = 0;
      var summarized30 = 0;
      meetRows.forEach(function (m) {
        if (m.status === "summarized") summarized30++;
        var when = m.created_at;
        if (when >= d14 && m.status !== "scheduled") {
          meetings14++;
          feedDayKeys[dayKey(when)] = true;
        }
      });

      setData({
        feed: {
          days14: Object.keys(feedDayKeys).length,
          meetings14: meetings14,
        },
        accuracy: {
          corr14: corr14,
          corrPrev14: corrPrev14,
          topType: topType,
          meetingsCorrected: Object.keys(meetingsCorrected).length,
          summarized30: summarized30,
        },
        canary: canary,
        cost: {
          usd30: usd30 / 1e6,
          thisWeekUsd: thisWeek / 1e6,
          prevWeekUsd: prevWeek / 1e6,
          top: byEndpoint[0] || null,
          endpoints: byEndpoint.slice(0, 5),
        },
      });
      setLoading(false);
    }, function () {
      if (cancelled) return;
      setData(null);
      setLoading(false);
    });

    return function () { cancelled = true; };
  }, [userId]);

  return { data: data, loading: loading };
}

// Human label for correction_type — used by the dashboard so the most-common
// correction reads in plain English instead of a DB enum.
export var CORRECTION_TYPE_LABEL = {
  summary_edit:          "summary edits",
  rejected_row:          "rejected rows",
  item_text_edit:        "reworded items",
  task_text_edit:        "reworded tasks",
  missed_item:           "things Pip missed",
  routed_account_changed: "wrong account routing",
};
