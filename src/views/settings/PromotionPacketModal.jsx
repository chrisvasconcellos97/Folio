import { useState, useEffect } from "react";
import { Modal } from "../../components/Modal";
import { C } from "../../lib/colors";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../components/Toast";
import { commitmentStats } from "../../lib/weekReview";
import { logSilentFailure } from "../../lib/logSilentFailure";

var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

var RANGES = [
  { key: "90",  label: "Last 90 days",  days: 90 },
  { key: "180", label: "Last 6 months", days: 180 },
  { key: "365", label: "Last year",     days: 365 },
];

function fmtDay(d) {
  return d.toISOString().slice(0, 10);
}

// Promotion packet — compiles the user's OWN work over a period into a clean,
// copyable artifact for review season: promises kept, wins, projects delivered,
// portfolio activity. Read-only (no writes). DATA LINE: titles + counts only,
// no revenue/volume/shop figures — it's the user's record of their own work.
export function PromotionPacketModal({ userId, accounts, onClose }) {
  var [rangeKey, setRangeKey] = useState("90");
  var [loading, setLoading]   = useState(true);
  var [data, setData]         = useState(null);

  var byId = {};
  (accounts || []).forEach(function (a) { byId[a.id] = a; });
  function acctName(id) { var a = byId[id]; return a ? a.name : null; }

  useEffect(function () {
    if (!userId) return;
    var range = RANGES.find(function (r) { return r.key === rangeKey; }) || RANGES[0];
    var now = new Date();
    var start = new Date(now.getTime() - range.days * 86400000);
    var startISO = fmtDay(start);
    var startTs = startISO + "T00:00:00";
    setLoading(true);

    Promise.all([
      // Wins logged in the window.
      supabase.from("folio_wins").select("title, account_id, created_at")
        .eq("user_id", userId).gte("created_at", startTs).order("created_at", { ascending: false }).limit(200),
      // Commitments (filter to those DUE in the window client-side → the rate
      // reflects promises that came due this period).
      supabase.from("folio_tasks").select("title, account_id, is_commitment, done, due_date, closed_at")
        .eq("user_id", userId).eq("is_commitment", true).limit(1000),
      // Logged (non-scheduled) meetings in the window → accounts actively managed.
      supabase.from("folio_meetings").select("account_id, account_ids, meeting_date, status")
        .eq("user_id", userId).gte("meeting_date", startISO).limit(1000),
      // Projects delivered (completed) in the window.
      supabase.from("gauge_projects").select("title, account_id, status, updated_at")
        .eq("user_id", userId).eq("status", "complete").gte("updated_at", startTs).limit(300),
    ]).then(function (res) {
      setLoading(false);
      var winRows = (res[0] && res[0].data) || [];
      var commitAll = (res[1] && res[1].data) || [];
      var mtgRows = (res[2] && res[2].data) || [];
      var projRows = (res[3] && res[3].data) || [];

      // Promises that came due in the window.
      var commitsDue = commitAll.filter(function (t) {
        return t.due_date && t.due_date >= startISO;
      });
      var stats = commitmentStats(commitsDue, { now: now });

      // Accounts actively managed: distinct accounts with a logged meeting.
      var touched = {};
      mtgRows.forEach(function (m) {
        if (m.status === "scheduled" || m.status === "draft") return;
        var ids = (m.account_ids && m.account_ids.length) ? m.account_ids : (m.account_id ? [m.account_id] : []);
        ids.forEach(function (id) { if (id) touched[id] = true; });
      });
      var meetingsLogged = mtgRows.filter(function (m) { return m.status !== "scheduled" && m.status !== "draft"; }).length;

      setData({
        rangeLabel: range.label,
        wins: winRows,
        stats: stats,
        projects: projRows,
        accountsManaged: Object.keys(touched).length,
        meetingsLogged: meetingsLogged,
      });
    }).catch(function (e) {
      setLoading(false);
      logSilentFailure("PromotionPacket/load", e);
      showToast("Couldn't pull the data right now", "error");
    });
  }, [userId, rangeKey]);

  function buildText() {
    if (!data) return "";
    var lines = [];
    lines.push("PROMOTION PACKET — " + data.rangeLabel);
    lines.push("Generated " + new Date().toISOString().slice(0, 10));
    lines.push("");

    lines.push("COMMITMENT INTEGRITY");
    if (data.stats.resolved > 0) {
      var pct = Math.round((data.stats.rate || 0) * 100);
      lines.push("Promises kept: " + data.stats.kept + " of " + data.stats.resolved + " (" + pct + "%)" +
        (data.stats.excused ? " · " + data.stats.excused + " excused (PTO)" : ""));
    } else {
      lines.push("No promises came due in this period.");
    }
    if (data.stats.open) lines.push(data.stats.open + " still open (not yet due).");
    lines.push("");

    lines.push("WINS (" + data.wins.length + ")");
    if (data.wins.length) {
      data.wins.forEach(function (w) {
        lines.push("- " + w.title + (acctName(w.account_id) ? " · " + acctName(w.account_id) : ""));
      });
    } else {
      lines.push("- (none logged — add them in Settings → Win log as they happen)");
    }
    lines.push("");

    lines.push("DELIVERED (" + data.projects.length + " project" + (data.projects.length === 1 ? "" : "s") + " completed)");
    if (data.projects.length) {
      data.projects.forEach(function (p) {
        lines.push("- " + (p.title || "Untitled") + (acctName(p.account_id) ? " · " + acctName(p.account_id) : ""));
      });
    } else {
      lines.push("- (none marked complete in this window)");
    }
    lines.push("");

    lines.push("PORTFOLIO ACTIVITY");
    lines.push("- " + data.accountsManaged + " account" + (data.accountsManaged === 1 ? "" : "s") + " actively managed");
    lines.push("- " + data.meetingsLogged + " meeting" + (data.meetingsLogged === 1 ? "" : "s") + " logged");

    return lines.join("\n");
  }

  function copyAll() {
    var text = buildText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast("Packet copied — paste it anywhere"); })
        .catch(function () { showToast("Couldn't copy to clipboard", "error"); });
    } else {
      showToast("Couldn't copy to clipboard", "error");
    }
  }

  return (
    <Modal title="Promotion packet" onClose={onClose} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.55, fontFamily: INTER }}>
          Your own record of the period — promises kept, wins, what you delivered. Data-line clean
          (no customer numbers), so it's safe to paste into a self-review or share with your manager.
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {RANGES.map(function (r) {
            var active = r.key === rangeKey;
            return (
              <button
                key={r.key}
                onClick={function () { setRangeKey(r.key); }}
                style={{
                  background: active ? C.accentFaint : "transparent",
                  border: "1px solid " + (active ? C.accentLine : C.border),
                  borderRadius: 8, padding: "5px 12px", fontSize: 12,
                  color: active ? C.accent : C.textMuted, fontFamily: INTER,
                  fontWeight: active ? 600 : 400, cursor: "pointer",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <pre style={{
          margin: 0, background: C.surface, border: "1px solid " + C.rule, borderRadius: 10,
          padding: "14px 16px", fontFamily: MONO, fontSize: 12, color: C.text, lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 360, overflowY: "auto",
        }}>
          {loading ? "Pulling your record…" : buildText()}
        </pre>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={copyAll}
            disabled={loading || !data}
            style={{
              background: C.accent, color: C.bg, border: "none", borderRadius: 8,
              padding: "8px 18px", fontSize: 13, fontWeight: 600, fontFamily: INTER,
              cursor: loading || !data ? "default" : "pointer", opacity: loading || !data ? 0.5 : 1,
            }}
          >
            Copy all
          </button>
        </div>
      </div>
    </Modal>
  );
}
