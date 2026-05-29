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

// Helper: compute signals for an account from raw collections.
export function gatherSignals(account, allItems, allProjects, todayISO) {
  var accountItems = (allItems || []).filter(function (i) { return i.account_id === account.id; });
  var openItemsAll = accountItems.filter(function (i) { return !i.done; });
  var openItemsOverdue = openItemsAll.filter(function (i) {
    return i.due_date && i.due_date < todayISO;
  }).length;
  var accountProjects = (allProjects || []).filter(function (p) { return p.account_id === account.id; });
  var blockedProjects = accountProjects.filter(function (p) { return p.status === 'blocked'; }).length;
  var onHoldProjects  = accountProjects.filter(function (p) { return p.status === 'on_hold'; }).length;
  var accountAgeDays  = account.created_at
    ? Math.floor((Date.now() - new Date(account.created_at).getTime()) / 86400000)
    : 999;

  // Missed cadences computation — too expensive to do per-render reliably.
  // Pass in `missedCadences: 0` for now; V2 brain will compute this from
  // cadence + meetings cross-reference. Stub it as 0 here.
  return {
    openItemsAll: openItemsAll.length,
    openItemsOverdue: openItemsOverdue,
    blockedProjects: blockedProjects,
    onHoldProjects: onHoldProjects,
    missedCadences: 0,
    lastInteractionAt: account.last_interaction_at,
    accountAgeDays: accountAgeDays,
  };
}
