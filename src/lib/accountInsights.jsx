// Pip insight builders used by OverviewTab. Each builder returns a React node
// (a sentence-or-two riff) tailored to the account type and the live signals
// available on it. Kept here so the OverviewTab render stays focused on
// layout — and so the prose riffs are independently unit-testable.
//
// Conventions:
//  • Use `pickV(seed, [...variants])` for any line where copy variants exist.
//    `seed` is `(account.id || account.name) + today` so the same user sees
//    the same line all day but gets a fresh take tomorrow.
//  • Wrap the live numeric/date in <Glow> when it's clickable (overdue,
//    blocked) so the tap target is the data, not a bare verb.

import { Glow } from "../components/Glow";
import { pickV, latestRecord, momPct, momDelta } from "./metricsUtils";

export function buildInternalTeamInsight(account, openItems, projects, handlers) {
  var openCount    = (openItems || []).filter(function (i) { return !i.done; }).length;
  var today        = new Date().toISOString().split("T")[0];
  var overdueCount = (openItems || []).filter(function (i) { return !i.done && i.due_date && i.due_date < today; }).length;
  var daysSince    = account.last_interaction_at
    ? Math.floor((Date.now() - new Date(account.last_interaction_at).getTime()) / 86400000)
    : null;
  var seed = (account.id || account.name) + new Date().getDate().toString();
  var h    = handlers || {};

  var overdueGlow = <Glow onClick={h.onClickOverdue}>{overdueCount + " overdue deliverable" + (overdueCount !== 1 ? "s" : "")}</Glow>;

  var lead;
  if (overdueCount > 0) {
    lead = pickV(seed + "a", [
      <>{account.name} has {overdueGlow}. Loop back with the team.</>,
      <>{overdueGlow} on {account.name}. Worth nudging.</>,
    ]);
  } else if (daysSince !== null && daysSince >= 21) {
    lead = pickV(seed + "a", [
      <>It's been {daysSince} days since you synced with {account.name}. Quick check-in?</>,
      <>{account.name} has gone quiet — {daysSince} days since last touch.</>,
    ]);
  } else if (openCount > 0) {
    lead = pickV(seed + "a", [
      <>{openCount} open task{openCount !== 1 ? "s" : ""} with {account.name} — track to close.</>,
      <>Active work with {account.name}: {openCount} thing{openCount !== 1 ? "s" : ""} in flight.</>,
    ]);
  } else {
    lead = pickV(seed + "a", [
      "Things are quiet here. Clean state.",
      "No outstanding work — you're square.",
    ]);
  }

  var prjs    = projects || [];
  var blocked = prjs.filter(function (p) { return p.status === "blocked"; });
  var active  = prjs.filter(function (p) { return p.status === "in_progress"; });
  var blockedGlow = <Glow onClick={h.onClickBlocked}>{blocked.length + " project" + (blocked.length !== 1 ? "s" : "") + " blocked"}</Glow>;

  var tail = null;
  if (blocked.length > 0) {
    tail = pickV(seed + "b", [
      <>{blockedGlow} in Gauge — time to unstick.</>,
      <>Gauge shows {blockedGlow} on this team.</>,
    ]);
  } else if (active.length > 0) {
    tail = <>{active.length} project{active.length !== 1 ? "s" : ""} in flight with this team.</>;
  }

  return <>{lead}{tail ? <> {tail}</> : null}</>;
}

export function buildPartnerInsight(account, openItems) {
  var openCount = (openItems || []).filter(function (i) { return !i.done; }).length;
  var daysSince = account.last_interaction_at
    ? Math.floor((Date.now() - new Date(account.last_interaction_at).getTime()) / 86400000)
    : null;
  var seed = (account.id || account.name) + new Date().getDate().toString();

  // Renewal check — the agreement date itself glows (cold = expired, warning = soon)
  var renewalLead = null;
  if (account.agreement_end_date) {
    var daysToRenew = Math.floor((new Date(account.agreement_end_date + "T00:00:00").getTime() - Date.now()) / 86400000);
    if (daysToRenew < 0) {
      var expiredGlow = <Glow>{"expired " + Math.abs(daysToRenew) + " day" + (Math.abs(daysToRenew) !== 1 ? "s" : "") + " ago"}</Glow>;
      renewalLead = pickV(seed + "r", [
        <>Agreement {expiredGlow}. Renew or close out.</>,
        <>{account.name}'s agreement is {expiredGlow}. Address it.</>,
      ]);
    } else if (daysToRenew <= 30) {
      var soonGlow = <Glow>{"renewal in " + daysToRenew + " day" + (daysToRenew !== 1 ? "s" : "")}</Glow>;
      renewalLead = pickV(seed + "r", [
        <>{soonGlow} — start the conversation.</>,
        <>Agreement ends soon — {soonGlow}. Time to revisit scope.</>,
      ]);
    } else if (daysToRenew <= 90) {
      renewalLead = <>Renewal with {account.name} in ~{Math.round(daysToRenew / 7)} weeks. Worth a check-in.</>;
    }
  }

  var fallbackLead = null;
  if (!renewalLead && daysSince !== null && daysSince >= 60) {
    fallbackLead = pickV(seed + "a", [
      <>Haven't touched base with {account.name} in {daysSince} days. Worth a quick check.</>,
      <>{account.name} has gone quiet — {daysSince} days. Stay close to the relationship.</>,
    ]);
  } else if (!renewalLead && openCount > 0) {
    fallbackLead = <>{openCount} open item{openCount !== 1 ? "s" : ""} with {account.name}.</>;
  } else if (!renewalLead) {
    fallbackLead = pickV(seed + "a", [
      "Things are steady with " + account.name + ". No action needed right now.",
      account.name + " is in good standing.",
    ]);
  }

  var lead = renewalLead || fallbackLead;
  var tail = account.scope_summary
    ? <> Scope: {account.scope_summary.split(/[.!?]/)[0]}.</>
    : null;

  return <>{lead}{tail}</>;
}

export function buildCustomerInsight(account, openItems, revenueHistory, shopMetrics, projects, handlers) {
  var rh = revenueHistory || [];
  var sm = shopMetrics    || [];

  var openCount    = openItems.filter(function (i) { return !i.done; }).length;
  var today        = new Date().toISOString().split("T")[0];
  var overdueCount = openItems.filter(function (i) { return !i.done && i.due_date && i.due_date < today; }).length;

  var daysSince = null;
  if (account.last_interaction_at) {
    daysSince = Math.floor((Date.now() - new Date(account.last_interaction_at).getTime()) / 86400000);
  }

  var latestRev  = latestRecord(rh, account.id);
  var revMom     = latestRev ? momPct(rh, account.id, "revenue") : null;
  var latestShop = latestRecord(sm, account.id);
  var nocDelta   = latestShop ? momDelta(sm, account.id, "no_connection") : null;
  var intgDelta  = latestShop ? momDelta(sm, account.id, "integrated")    : null;

  var hasNextMeeting   = !!account.next_meeting;
  var nextMeetingLabel = account.next_meeting
    ? new Date(account.next_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  var seed      = (account.id || account.name) + new Date().getDate().toString();
  var isGhosted = daysSince !== null && daysSince >= 60;
  var isStale   = daysSince !== null && daysSince >= 30 && daysSince < 60;
  var parts     = [];

  // Lead — most critical signal first
  if (account.status === "red" && isGhosted) {
    parts.push(pickV(seed + "a", [
      account.name + " is at risk and it's been " + daysSince + " days since your last touchpoint. That's a long silence.",
      account.name + " is flagged and you haven't touched base in " + daysSince + " days. This one needs a call.",
      "Red flag and " + daysSince + " days since contact on " + account.name + " — bump this to the top of the list.",
    ]));
  } else if (account.status === "red") {
    parts.push(pickV(seed + "a", [
      account.name + " needs attention." + (openCount > 0 ? " " + openCount + " open item" + (openCount !== 1 ? "s" : "") + " in the queue." : " The relationship needs a check-in."),
      account.name + " is flagged. I'd get ahead of this before it slips further.",
      "Something's off with " + account.name + ". Worth a proactive check-in before the next call.",
    ]));
  } else if (isGhosted) {
    parts.push(pickV(seed + "a", [
      "It's been " + daysSince + " days since you touched " + account.name + ". Might be worth a quick check-in.",
      account.name + " hasn't heard from you in " + daysSince + " days. A short email or call goes a long way.",
      "Quiet on the " + account.name + " front — " + daysSince + " days since last contact. Don't let this one go cold.",
    ]));
  } else if (isStale && account.status === "yellow") {
    parts.push(pickV(seed + "a", [
      account.name + " is in a watchful state and you haven't reached out in " + daysSince + " days. Keep the momentum going.",
      daysSince + " days since your last touchpoint with " + account.name + " — and they're still yellow. Stay on it.",
      account.name + " is watch-listed and going a bit quiet. A check-in now could shift the trajectory.",
    ]));
  } else if (account.status === "yellow") {
    parts.push(pickV(seed + "a", [
      account.name + " is moving in the right direction, but there's still work to do.",
      account.name + " is trending okay. Watch the open items — they'll tell you if this is slipping.",
      "Cautiously optimistic on " + account.name + ". Yellow means watch it, not forget it.",
    ]));
  } else if (account.status === "green" && daysSince !== null && daysSince <= 14) {
    parts.push(pickV(seed + "a", [
      account.name + " is in solid shape — and you were just there " + daysSince + " days ago. Good cadence.",
      account.name + " looks healthy. Recent contact, clean pipeline. Don't jinx it.",
      "Good momentum with " + account.name + ". Status is green and the relationship is active.",
    ]));
  } else {
    parts.push(pickV(seed + "a", [
      account.name + " is in good shape. Relationship looks solid from where I'm sitting.",
      account.name + " is healthy. Keep doing what you're doing.",
      "No red flags on " + account.name + ". Clean status, things are moving.",
    ]));
  }

  // Secondary — revenue signal if meaningful
  if (revMom !== null && revMom >= 10) {
    parts.push(pickV(seed + "b", [
      "Revenue is up " + revMom + "% month over month — strong.",
      "MoM revenue is up " + revMom + "%. That's a good number.",
    ]));
  } else if (revMom !== null && revMom <= -10) {
    parts.push(pickV(seed + "b", [
      "Revenue dropped " + Math.abs(revMom) + "% month over month — worth a closer look.",
      "MoM revenue is down " + Math.abs(revMom) + "%. Keep an eye on the trend.",
    ]));
  }

  // Tertiary — shop signals
  if (nocDelta !== null && nocDelta > 0) {
    parts.push(pickV(seed + "c", [
      "No-connection count is up " + nocDelta + " this month — flag it on your next call.",
      nocDelta + " more shops with no connection this month. That needs follow-up.",
    ]));
  } else if (intgDelta !== null && intgDelta > 0) {
    parts.push(pickV(seed + "c", [
      intgDelta + " more shops integrated this month — nice progress.",
      "Integration count is up " + intgDelta + ". That's a win.",
    ]));
  }

  var h = handlers || {};
  var overdueGlow = <Glow onClick={h.onClickOverdue}>{overdueCount + " item" + (overdueCount !== 1 ? "s" : "") + " overdue"}</Glow>;

  // Closing — overdue, next meeting, or nudge
  if (overdueCount > 0) {
    parts.push(pickV(seed + "d", [
      <>{overdueGlow} — clear those before your next call.</>,
      <>You've got {overdueGlow}. Get them cleared.</>,
    ]));
  } else if (hasNextMeeting) {
    parts.push(pickV(seed + "d", [
      "Next meeting is on " + nextMeetingLabel + " — you're good.",
      "Scheduled for " + nextMeetingLabel + ". Stay prepared.",
    ]));
  } else if (account.status !== "red") {
    parts.push(pickV(seed + "d", [
      "No meeting on the calendar — worth booking something.",
      "Nothing scheduled yet. A quick check-in could keep this one warm.",
    ]));
  }

  // Projects signal
  var prjs = projects || [];
  var blocked = prjs.filter(function(p) { return p.status === "blocked"; });
  var active  = prjs.filter(function(p) { return p.status === "in_progress"; });
  var blockedGlow = <Glow onClick={h.onClickBlocked}>{blocked.length + " project" + (blocked.length !== 1 ? "s" : "") + " blocked"}</Glow>;
  if (blocked.length > 0 && parts.length < 3) {
    parts.push(pickV(seed + "gp", [
      <>{blockedGlow} in Gauge — flag it on your next call.</>,
      <>{blockedGlow}. Worth addressing.</>,
    ]));
  } else if (active.length > 0 && parts.length < 3) {
    parts.push(pickV(seed + "gp", [
      active.length + " project" + (active.length !== 1 ? "s" : "") + " in flight in Gauge.",
      "Tracking " + active.length + " active Gauge project" + (active.length !== 1 ? "s" : "") + " for this account.",
    ]));
  }

  return <>{parts.map(function (p, i) { return <span key={i}>{i > 0 ? " " : ""}{p}</span>; })}</>;
}

// Public entry — dispatches on account_type.
export function buildPipInsight(account, openItems, revenueHistory, shopMetrics, projects, handlers) {
  if (account.account_type === "internal_team") return buildInternalTeamInsight(account, openItems, projects, handlers);
  if (account.account_type === "partner")       return buildPartnerInsight(account, openItems, projects, handlers);
  return buildCustomerInsight(account, openItems, revenueHistory, shopMetrics, projects, handlers);
}
