import { projectMatchesAccount } from "./gaugeStatus";

// Canonical display labels for computed health statuses. Exported so
// AccountDetailHeader, AccountsView, and any other consumer share one
// source of truth instead of each declaring their own copy.
export var STATUS_LABELS = { green: "Healthy", yellow: "Watching", red: "At Risk", new: "New" };

// Ownership predicate (item 38) — an account is "mine to manage" unless it's
// explicitly owned by someone else (owner_user_id set AND != me). Accounts with
// no owner set are treated as mine. ONE shared copy so every surface that
// suppresses relationship nudges (cold/warm/fires/anomalies) for not-mine (e.g.
// MSO) accounts agrees — was duplicated inline across HomeView (App Coherence
// Rule). For not-mine accounts only project-level work should surface, never
// outreach/cold-contact/at-risk urgency.
export function isMine(account, userId) {
  if (!account) return false;
  if (!account.owner_user_id || !userId) return true;
  return account.owner_user_id === userId;
}
export function notMyRelationship(account, userId) {
  return !isMine(account, userId);
}

// Canonical health label — the ONE place green/yellow/red/new (computeAccountHealth)
// AND healthy/watching/at_risk (snapshots) map to display text. Use this instead
// of re-declaring { green:"Healthy", ... } maps per surface (they drifted: some
// knew "new", some didn't).
export function healthLabel(status) {
  switch (status) {
    case "green":
    case "healthy":   return "Healthy";
    case "yellow":
    case "watching":  return "Watching";
    case "red":
    case "at_risk":   return "At Risk";
    case "new":       return "New";
    default:          return "—";
  }
}

// Computes account health from signals. Tier-aware thresholds.
// Returns { status: 'green'|'yellow'|'red'|'new', reason: string, reasons: string[] }.
// `reason` = the single primary driver (backward compat); `reasons` = EVERY
// contributing factor, human-readable, so surfaces can show "At Risk *because* —
// 24d no contact · 2 items overdue · a project blocked" instead of one opaque
// label (explainable health, item 51 Tier 1). Override (when set) supersedes all.
export function computeAccountHealth(account, signals) {
  // signals: { openItemsOverdue, openItemsAll, blockedProjects, onHoldProjects, missedCadences, lastInteractionAt, accountAgeDays }
  // Override path first
  if (account.status_override) {
    var until = account.status_override_until;
    if (!until || new Date(until + 'T00:00:00') >= new Date()) {
      var oReason = account.status_override_reason || 'pinned';
      return {
        status: account.status_override,
        reason: oReason,
        reasons: [oReason],
        pinned: true,
      };
    }
  }

  // "New" — fresh account, no signal
  var noTouch = !signals.lastInteractionAt;
  if (signals.accountAgeDays < 7 && noTouch) {
    return { status: 'new', reason: 'new', reasons: ['new account, no contact yet'], pinned: false };
  }

  // Tier thresholds
  var tier = account.tier || 'Growth';
  var TH = {
    Major:  { redCold: 30, yelCold: 14, redOverdue: 3, yelOverdueMax: 2 },
    Mid:    { redCold: 45, yelCold: 21, redOverdue: 3, yelOverdueMax: 2 },
    Growth: { redCold: 60, yelCold: 30, redOverdue: 4, yelOverdueMax: 3 },
  };
  var th = TH[tier] || TH.Growth;

  var daysCold = signals.lastInteractionAt
    ? Math.floor((Date.now() - new Date(signals.lastInteractionAt).getTime()) / 86400000)
    : null;

  // Collect EVERY contributing factor, tagged by severity. Status is the worst
  // severity present; order within red/yellow preserves the legacy primary-reason
  // priority (cold → blocked → overdue → cadence). No status outcome changes.
  var red = [], yellow = [];

  if (daysCold !== null && daysCold > th.redCold) red.push(daysCold + 'd no substantive contact');
  else if (daysCold !== null && daysCold >= th.yelCold) yellow.push(daysCold + 'd since last contact');

  if (signals.blockedProjects > 0) {
    red.push(signals.blockedProjects > 1 ? signals.blockedProjects + ' projects blocked' : 'a project blocked');
  }
  if (signals.openItemsOverdue >= th.redOverdue) {
    red.push(signals.openItemsOverdue + ' items overdue');
  } else if (signals.openItemsOverdue >= 1) {
    yellow.push(signals.openItemsOverdue + (signals.openItemsOverdue > 1 ? ' items overdue' : ' item overdue'));
  }
  if (signals.missedCadences >= 2) red.push('cadence missed twice');

  if (signals.onHoldProjects > 0) {
    yellow.push(signals.onHoldProjects > 1 ? signals.onHoldProjects + ' projects on hold' : 'a project on hold');
  }

  var status = red.length ? 'red' : (yellow.length ? 'yellow' : 'green');
  var reasons = red.concat(yellow);
  if (!reasons.length) reasons = ['on track'];

  return { status: status, reason: reasons[0], reasons: reasons, pinned: false };
}

var FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30 };

// Count how many cadence cycles have been skipped across all active cadences
// for an account. A cycle counts as missed when no logged meeting exists within
// the expected interval window and at least one full interval has elapsed since
// the cadence was created.
function computeMissedCadences(accountId, allCadences, allMeetings, todayISO) {
  var cadences = (allCadences || []).filter(function (c) {
    return c.account_id === accountId;
  });
  if (!cadences.length) return 0;

  var today = new Date(todayISO);
  var missed = 0;

  cadences.forEach(function (cadence) {
    var interval = FREQ_DAYS[cadence.frequency] || 30;
    var created  = cadence.created_at ? new Date(cadence.created_at) : null;
    if (!created) return;

    // Grace period — don't flag cadences newer than one full interval
    var daysSinceCreated = Math.floor((today - created) / 86400000);
    if (daysSinceCreated < interval) return;

    // Most recent logged (non-draft) meeting for this cadence
    var cadenceMeetings = (allMeetings || []).filter(function (m) {
      return m.cadence_id === cadence.id && m.status !== 'draft';
    });

    var lastDate = null;
    cadenceMeetings.forEach(function (m) {
      var d = new Date(m.meeting_date ? m.meeting_date + "T00:00:00" : m.created_at);
      if (!lastDate || d > lastDate) lastDate = d;
    });

    var daysSinceLastMeeting = lastDate
      ? Math.floor((today - lastDate) / 86400000)
      : daysSinceCreated;

    // Each full interval past the first counts as one missed cycle
    var slotsMissed = Math.max(0, Math.floor(daysSinceLastMeeting / interval) - 1);
    missed += Math.min(slotsMissed, 4); // cap per-cadence to avoid outliers dominating
  });

  return missed;
}

// Helper: compute signals for an account from raw collections.
// allCadences + allMeetings are optional — when omitted missedCadences stays 0
// (used by in-render callers that don't have meeting data loaded).
export function gatherSignals(account, allItems, allProjects, todayISO, allCadences, allMeetings) {
  var accountItems = (allItems || []).filter(function (i) { return i.account_id === account.id; });
  var openItemsAll = accountItems.filter(function (i) { return !i.done; });
  var openItemsOverdue = openItemsAll.filter(function (i) {
    return i.due_date && i.due_date < todayISO;
  }).length;
  var accountProjects = (allProjects || []).filter(function (p) { return projectMatchesAccount(p, account.id); });
  var blockedProjects = accountProjects.filter(function (p) { return p.status === 'blocked'; }).length;
  var onHoldProjects  = accountProjects.filter(function (p) { return p.status === 'on_hold'; }).length;
  var accountAgeDays  = account.created_at
    ? Math.floor((Date.now() - new Date(account.created_at).getTime()) / 86400000)
    : 999;

  return {
    openItemsAll: openItemsAll.length,
    openItemsOverdue: openItemsOverdue,
    blockedProjects: blockedProjects,
    onHoldProjects: onHoldProjects,
    missedCadences: (allCadences && allMeetings)
      ? computeMissedCadences(account.id, allCadences, allMeetings, todayISO)
      : 0,
    lastInteractionAt: account.last_interaction_at,
    accountAgeDays: accountAgeDays,
  };
}
