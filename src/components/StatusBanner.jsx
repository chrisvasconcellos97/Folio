import { useMemo } from "react";
import { C } from "../lib/colors";
import { PipOrb } from "./PipMark";
import { Glow } from "./Glow";
import { pickV } from "../lib/metricsUtils";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

function plural(n, s) { return n + " " + s + (n !== 1 ? "s" : ""); }

// Pure stats reducer — extracted so the inactive-exclusion behavior is
// unit-testable without rendering the whole banner.
export function computeBannerStats(accounts, items, meetings, nowMs) {
  var now      = typeof nowMs === "number" ? nowMs : Date.now();
  var todayStr = new Date(now).toISOString().split("T")[0];
  var weekOut  = (function () { var d = new Date(now); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
  var thirtyDaysMs = 30 * 86400000;

  var activeAccounts = (accounts || []).filter(function (a) { return !a.is_inactive; });
  var activeIds      = {};
  activeAccounts.forEach(function (a) { activeIds[a.id] = true; });

  var cold = activeAccounts.filter(function (a) {
    var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime()
      : a.last_meeting ? new Date(a.last_meeting + "T00:00:00").getTime() : null;
    if (last === null) return true;
    return (now - last) > thirtyDaysMs;
  }).length;

  var overdue = (items || []).filter(function (i) {
    if (i.account_id && !activeIds[i.account_id]) return false;
    return !i.done && i.due_date && i.due_date < todayStr;
  }).length;

  var followUps = (meetings || []).filter(function (m) {
    if (m.account_id && !activeIds[m.account_id]) return false;
    return m.follow_up_date && m.follow_up_date >= todayStr && m.follow_up_date <= weekOut;
  }).length;

  return { cold: cold, overdue: overdue, followUps: followUps };
}

export function StatusBanner({ accounts, items, meetings, onColdClick, onOverdueClick, onFollowUpClick }) {
  // One-time purge of leftover per-day dismiss flags from the prior behavior.
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf("folio_banner_dismissed_") === 0) localStorage.removeItem(k);
    });
  } catch (e) {}

  var stats = useMemo(function () {
    return computeBannerStats(accounts, items, meetings);
  }, [accounts, items, meetings]);

  if (stats.cold === 0 && stats.overdue === 0 && stats.followUps === 0) return null;

  var seed = new Date().getDate().toString() + ":" + stats.cold + ":" + stats.overdue + ":" + stats.followUps;
  var cold      = <Glow onClick={onColdClick}>{plural(stats.cold, "account") + " going cold"}</Glow>;
  var overdue   = <Glow onClick={onOverdueClick}>{plural(stats.overdue, "item") + " overdue"}</Glow>;
  var followUps = <Glow onClick={onFollowUpClick}>{plural(stats.followUps, "follow-up") + " this week"}</Glow>;

  var body;
  var c = stats.cold > 0, o = stats.overdue > 0, f = stats.followUps > 0;

  if (c && o && f) {
    body = pickV(seed, [
      <>Lot to keep an eye on — {cold}, {overdue}, and {followUps}. Pick what's highest-leverage and start there.</>,
      <>Busy board. {cold}, {overdue}, and {followUps} due. I'd hit the overdue stuff first.</>,
      <>Quite a bit on the radar: {cold}, {overdue}, plus {followUps} on deck. Don't let the cold ones drift further.</>,
    ]);
  } else if (c && o) {
    body = pickV(seed, [
      <>{cold} and {overdue} — pick whichever feels more urgent and clear it.</>,
      <>{cold} need a check-in, and {overdue} is sitting on you. I'd start with the overdues.</>,
    ]);
  } else if (c && f) {
    body = pickV(seed, [
      <>{cold} have gone quiet, and {followUps} due this week. A quick touch on the cold ones could go a long way.</>,
      <>{cold} lately, and {followUps} on deck. Keep the rhythm going.</>,
    ]);
  } else if (o && f) {
    body = pickV(seed, [
      <>{overdue} and {followUps}. Clear the overdue stuff before the follow-ups land.</>,
      <>{overdue}, plus {followUps} coming. Stay ahead of it.</>,
    ]);
  } else if (c) {
    body = pickV(seed, [
      <>Quiet on {cold} for a month or more — worth getting ahead of those before they slip further.</>,
      <>{cold} have gone quiet. A short check-in goes a long way.</>,
      <>{cold} on the cold list. Don't let them drift.</>,
    ]);
  } else if (o) {
    body = pickV(seed, [
      <>You've got {overdue}. Clear those before they pile up.</>,
      <>{overdue} sitting past due. Worth knocking out.</>,
      <>{overdue} on the overdue pile — get them off your back.</>,
    ]);
  } else if (f) {
    body = pickV(seed, [
      <>{followUps} queued for this week. Stay ready.</>,
      <>{followUps} on deck for the week. Block the time.</>,
      <>{followUps} coming up this week. Don't let them sneak up.</>,
    ]);
  }

  return (
    <div style={{
      // Theme-aware Pip-card surface (see PipInsightCard for full notes).
      background: "var(--c-pip-card-bg)",
      border: "1px solid " + C.accentBorder,
      borderRadius: 8,
      padding: "14px 16px",
      marginBottom: 12,
      boxShadow: "var(--c-pip-card-shadow)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, alignItems: "start" }}>
        <PipOrb size="md" />
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
            Pip Noticed
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 15, color: C.textSoft, lineHeight: 1.55 }}>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
