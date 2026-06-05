import { projectMatchesAccount } from "./gaugeStatus";

// Computes account health from signals. Tier-aware thresholds.
// Returns { status: 'green'|'yellow'|'red'|'new', reason: string }.
// Override (when set) supersedes everything.
export function computeAccountHealth(account, signals) {
  // signals: { openItemsOverdue, openItemsAll, blockedProjects, onHoldProjects, missedCadences, lastInteractionAt, accountAgeDays }
  // Override path first
  if (account.status_override) {
    var until = account.status_override_until;
    if (!until || new Date(until + 'T00:00:00') >= new Date()) {
      return {
        status: account.status_override,
        reason: account.status_override_reason || 'pinned',
        pinned: true,
      };
    }
  }

  // "New" — fresh account, no signal
  var noTouch = !signals.lastInteractionAt;
  if (signals.accountAgeDays < 7 && noTouch) {
    return { status: 'new', reason: 'new', pinned: false };
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

  // Red triggers
  if (daysCold !== null && daysCold > th.redCold) {
    return { status: 'red', reason: daysCold + 'd cold', pinned: false };
  }
  if (signals.blockedProjects > 0) {
    return { status: 'red', reason: 'project blocked', pinned: false };
  }
  if (signals.openItemsOverdue >= th.redOverdue) {
    return { status: 'red', reason: signals.openItemsOverdue + ' overdue', pinned: false };
  }
  if (signals.missedCadences >= 2) {
    return { status: 'red', reason: 'cadence missed twice', pinned: false };
  }

  // Yellow triggers
  if (daysCold !== null && daysCold >= th.yelCold) {
    return { status: 'yellow', reason: daysCold + 'd cold', pinned: false };
  }
  if (signals.openItemsOverdue >= 1 && signals.openItemsOverdue <= th.yelOverdueMax) {
    return { status: 'yellow', reason: signals.openItemsOverdue + ' overdue', pinned: false };
  }
  if (signals.onHoldProjects > 0) {
    return { status: 'yellow', reason: 'project on hold', pinned: false };
  }

  return { status: 'green', reason: 'on track', pinned: false };
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
      var d = new Date(m.meeting_date || m.created_at);
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
