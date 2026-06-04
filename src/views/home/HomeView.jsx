import { useState, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { LitPill } from "../../components/LitPill";
import { Glow } from "../../components/Glow";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { getNextOccurrence, formatTime } from "../../lib/cadenceUtils";
import { useAccountSnapshots } from "../../hooks/useAccountSnapshots";
import { callPortfolioBriefPip } from "../../lib/pip";

var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function timeOfDayGreeting(name) {
  var h = new Date().getHours();
  var n = name ? ", " + name : "";
  if (h < 5)  return "Late" + n + ".";
  if (h < 12) return "Morning" + n + ".";
  if (h < 17) return "Afternoon" + n + ".";
  if (h < 21) return "Evening" + n + ".";
  return "Late" + n + ".";
}

function dateLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function startOfToday() {
  var d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function isToday(d) {
  if (!d) return false;
  var s = startOfToday();
  var dt = new Date(d);
  return dt.getFullYear() === s.getFullYear() && dt.getMonth() === s.getMonth() && dt.getDate() === s.getDate();
}

function pickHeroLine(counts) {
  // Template-driven hero line. The genius Pip rewrite happens later (V2 brain);
  // for now we pick a tone based on the actual numbers and write in Pip's voice.
  var calls    = counts.calls;
  var overdue  = counts.overdue;

  if (calls === 0 && overdue === 0) {
    return "Quiet day. Nothing pressing — let's stay ahead.";
  }
  if (calls > 0 && overdue === 0) {
    return calls === 1
      ? "One call today. Nothing burning."
      : calls + " calls today. Nothing burning.";
  }
  if (calls === 0 && overdue > 0) {
    return overdue === 1
      ? "Quiet calendar — but one thing needs your eyes."
      : "Quiet calendar — but " + overdue + " things need your eyes.";
  }
  // Both
  if (calls >= 4 || overdue >= 8) {
    return "Big day. " + calls + " call" + (calls !== 1 ? "s" : "") + ", " + overdue + " thing" + (overdue !== 1 ? "s" : "") + " overdue. Let's pick a path.";
  }
  return calls + " call" + (calls !== 1 ? "s" : "") + " today, " + overdue + " thing" + (overdue !== 1 ? "s" : "") + " needing eyes.";
}

function Panel({ title, accent, children }) {
  return (
    <div style={{
      background: C.surface,
      border: "1px solid " + C.rule,
      borderLeft: "2px solid " + (accent || C.rule),
      borderRadius: 12,
      padding: "14px 16px 16px",
      minHeight: 110,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 10, color: accent || C.textMuted,
        fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: INTER, fontSize: 14, color: C.textSoft,
        lineHeight: 1.6,
      }}>
        {children}
      </div>
    </div>
  );
}

// Account name from a row's accountId, short.
function acctName(accountById, accountId) {
  var a = accountById[accountId];
  return a ? a.name : "an account";
}

// Split brief prose and wrap known account names in Glow components.
function renderBriefWithGlows(text, accounts, onOpenAccount) {
  if (!text) return null;
  if (!accounts || !accounts.length || !onOpenAccount) return text;
  var named = accounts
    .filter(function (a) { return a.name && a.name.length > 3; })
    .sort(function (a, b) { return b.name.length - a.name.length; });
  var segments = [text];
  named.forEach(function (account) {
    var next = [];
    segments.forEach(function (seg) {
      if (typeof seg !== "string") { next.push(seg); return; }
      var parts = seg.split(account.name);
      if (parts.length === 1) { next.push(seg); return; }
      parts.forEach(function (part, i) {
        if (part) next.push(part);
        if (i < parts.length - 1) {
          var id = account.id + "-" + i;
          next.push(
            <Glow key={id} onClick={function () { onOpenAccount(account.id); }}>
              {account.name}
            </Glow>
          );
        }
      });
    });
    segments = next;
  });
  return segments;
}

export function HomeView({ userName, userId, accounts, meetings, items, cadences, projects, onOpenAccount, onOpenAccountTab, onOpenCadenceHub, onOpenConversation, onOpenQuickTask, showOnboardingCard, onStartInterview, onDismissOnboardingCard, dripQuestion, onAnswerDrip, onSkipDrip, onDismissDrip, commitmentNudges, onSnoozeNudge, onMarkNudgeDone }) {
  commitmentNudges = commitmentNudges || [];
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;
  var [mounted, setMounted] = useState(false);
  var [dailyBrief, setDailyBrief] = useState("");
  var [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  var [briefCallouts, setBriefCallouts] = useState([]);
  var [briefLoading, setBriefLoading] = useState(false);
  var [dripAnswer, setDripAnswer]     = useState("");
  var [dripSaving, setDripSaving]     = useState(false);

  // Reset textarea when the active question changes.
  useEffect(function () { setDripAnswer(""); }, [dripQuestion && dripQuestion.id]);

  var { snapshots } = useAccountSnapshots(userId);

  useEffect(function () {
    var t = setTimeout(function () { setMounted(true); }, 60);
    return function () { clearTimeout(t); };
  }, []);

  // Daily brief — generated once per calendar day, cached in localStorage.
  // Only fires when snapshots are ready and the brief hasn't been generated today.
  useEffect(function () {
    if (!snapshots || snapshots.length === 0) return;

    var todayStr = new Date().toISOString().slice(0, 10);
    var cacheKey = "folio_daily_brief_v3_" + todayStr;

    // Check localStorage cache first — if we have a brief for today, use it.
    try {
      var cached = localStorage.getItem(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.brief) {
          setDailyBrief(parsed.brief);
          setBriefCallouts(parsed.callouts || []);
          return;
        }
      }
    } catch (_) { /* ignore localStorage parse errors */ }

    // Not cached — generate via Pip API. Guard against double-fire.
    setBriefLoading(function (already) {
      if (already) return already;

      // Build overdue item text per account so Pip can name them specifically
      var overdueByAccount = {};
      (items || []).forEach(function (item) {
        if (!item.done && item.due_date && item.due_date < todayStr) {
          if (!overdueByAccount[item.account_id]) overdueByAccount[item.account_id] = [];
          overdueByAccount[item.account_id].push(item.text || item.title || item.description || "Unnamed item");
        }
      });

      var snapshotsWithDetails = snapshots.map(function (s) {
        var acc = (accounts || []).find(function (a) { return a.id === s.account_id; });
        return Object.assign({}, s, {
          account_name: acc ? acc.name : "Unknown",
          overdue_items: (overdueByAccount[s.account_id] || []).slice(0, 3),
        });
      });

      var sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      var activeProjects = (projects || []).filter(function (p) {
        return p.status === "in_progress";
      }).map(function (p) {
        var stages = p.stages || [];
        var hasRecent = stages.some(function (s) { return s.completed_at && s.completed_at > sevenDaysAgo; });
        return Object.assign({}, p, { is_stuck: !hasRecent });
      });

      var recentWins = (projects || []).filter(function (p) {
        return p.status === "complete" && p.updated_at && p.updated_at > sevenDaysAgo;
      }).map(function (p) { return Object.assign({}, p, { completed_recently: true }); });

      callPortfolioBriefPip({
        snapshots: snapshotsWithDetails,
        projects: activeProjects.concat(recentWins),
      }).then(function (result) {
        setBriefLoading(false);
        if (result && result.brief) {
          setDailyBrief(result.brief);
          setBriefCallouts(result.callouts || []);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ brief: result.brief, callouts: result.callouts || [], date: todayStr }));
          } catch (_) { /* ignore */ }
        }
      }).catch(function (err) {
        setBriefLoading(false);
        console.warn("[HomeView] daily brief failed:", err && err.message);
      });

      return true; // mark loading
    });
  // Trigger only when snapshot count changes (i.e., when they first arrive).
  // accounts/projects are stable refs from parent hooks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots.length]);

  var accountById = useMemo(function () {
    var m = {};
    (accounts || []).forEach(function (a) { if (!a.is_inactive) m[a.id] = a; });
    return m;
  }, [accounts]);

  var todayISO = startOfToday().toISOString().slice(0, 10);

  // ── Today's Calls ────────────────────────────────────────────────────
  var todaysCalls = useMemo(function () {
    var today = startOfToday();
    return (cadences || [])
      .filter(function (c) { return c.type !== "task"; })
      .map(function (c) {
        var next = getNextOccurrence(c, today);
        if (!next || !isToday(next)) return null;
        var account = accountById[c.account_id];
        if (!account) return null;
        return { cadence: c, account: account, when: next };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        var ta = (a.cadence.meeting_time || "23:59");
        var tb = (b.cadence.meeting_time || "23:59");
        return ta.localeCompare(tb);
      });
  }, [cadences, accountById]);

  // ── Burning ──────────────────────────────────────────────────────────
  // Overdue items + blocked/overdue projects + cold accounts (>45d).
  // Sorted: longest overdue first, oldest cold next. Top 6.
  var burningRows = useMemo(function () {
    var rows = [];

    (items || []).forEach(function (i) {
      if (i.done || !i.due_date || i.due_date >= todayISO) return;
      var acct = accountById[i.account_id];
      if (!acct) return;
      var daysOver = Math.floor((Date.now() - new Date(i.due_date + "T00:00:00").getTime()) / 86400000);
      rows.push({
        key: "item:" + i.id,
        kind: "item",
        accountId: i.account_id,
        sortKey: -daysOver * 100 - 50,
        left: i.text,
        sub: acct.name,
        right: daysOver === 0 ? "today" : daysOver + "d over",
      });
    });

    (projects || []).forEach(function (p) {
      var acct = accountById[p.account_id];
      if (!acct) return;
      var isBlocked = p.status === "blocked";
      var isOverdue = p.status !== "complete" && p.due_date && p.due_date < todayISO;
      if (!isBlocked && !isOverdue) return;
      var daysOver = isOverdue ? Math.floor((Date.now() - new Date(p.due_date + "T00:00:00").getTime()) / 86400000) : 0;
      rows.push({
        key: "project:" + p.id,
        kind: "project",
        accountId: p.account_id,
        sortKey: isBlocked ? -800 : -daysOver * 100 - 200,
        left: p.title,
        sub: acct.name,
        right: isBlocked ? "blocked" : (daysOver + "d over"),
      });
    });

    (accounts || []).forEach(function (a) {
      if (a.is_inactive) return;
      var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      if (!last) return;
      var daysCold = Math.floor((Date.now() - last) / 86400000);
      if (daysCold < 45) return;
      rows.push({
        key: "cold:" + a.id,
        kind: "cold",
        accountId: a.id,
        sortKey: -daysCold,
        left: a.name + " — gone cold",
        sub: "no contact in " + daysCold + " days",
        right: daysCold + "d",
      });
    });

    rows.sort(function (x, y) { return x.sortKey - y.sortKey; });
    return rows.slice(0, 6);
  }, [items, projects, accounts, accountById, todayISO]);

  // ── Loose Ends ───────────────────────────────────────────────────────
  // Draft meetings that haven't been summarized yet, sorted by stale-ness.
  var looseEnds = useMemo(function () {
    return (meetings || [])
      .filter(function (m) { return m.status === "draft"; })
      .map(function (m) {
        var acct = accountById[m.account_id];
        if (!acct) return null;
        var updated = m.updated_at || m.created_at;
        var days = updated ? Math.floor((Date.now() - new Date(updated).getTime()) / 86400000) : 0;
        return {
          key: "draft:" + m.id,
          accountId: m.account_id,
          cadenceId: m.cadence_id,
          left: m.title || (acct.name + " — untitled draft"),
          sub: acct.name,
          right: days === 0 ? "today" : days + "d ago",
          days: days,
        };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.days - a.days; })
      .slice(0, 5);
  }, [meetings, accountById]);

  // ── Ahead ────────────────────────────────────────────────────────────
  // Upcoming cadences (next 7 days, excluding today) that don't yet have
  // a draft, plus warm Growth accounts not touched in 14-21 days.
  var aheadRows = useMemo(function () {
    var rows = [];
    var today = startOfToday();
    var weekOut = new Date(today.getTime() + 7 * 86400000);

    (cadences || []).forEach(function (c) {
      if (c.type === "task") return;
      var next = getNextOccurrence(c, new Date(today.getTime() + 86400000));
      if (!next || next > weekOut) return;
      var acct = accountById[c.account_id];
      if (!acct) return;
      // Has a draft for this cadence?
      var hasDraft = (meetings || []).some(function (m) {
        return m.cadence_id === c.id && m.status === "draft";
      });
      if (hasDraft) return;
      var daysOut = Math.floor((next.getTime() - today.getTime()) / 86400000);
      rows.push({
        key: "ahead-cadence:" + c.id,
        accountId: c.account_id,
        cadenceId: c.id,
        sortKey: daysOut * 10,
        left: acct.name + " — start prepping",
        sub: "cadence in " + daysOut + "d",
        right: daysOut + "d",
      });
    });

    (accounts || []).forEach(function (a) {
      if (a.is_inactive || a.tier !== "Growth") return;
      var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      if (!last) return;
      var daysCold = Math.floor((Date.now() - last) / 86400000);
      if (daysCold < 14 || daysCold > 21) return;
      rows.push({
        key: "warm:" + a.id,
        accountId: a.id,
        sortKey: 1000 + (21 - daysCold),
        left: a.name + " — stay warm",
        sub: "no contact in " + daysCold + "d, growth tier",
        right: daysCold + "d",
      });
    });

    rows.sort(function (x, y) { return x.sortKey - y.sortKey; });
    return rows.slice(0, 5);
  }, [cadences, meetings, accounts, accountById]);

  var heroLine = pickHeroLine({
    calls: todaysCalls.length,
    overdue: burningRows.filter(function (r) { return r.kind === "item"; }).length,
  });

  // ── Panels ──────────────────────────────────────────────────────────
  // ── Brief writers — Pip's narrative per panel ────────────────────────

  function todaysCallsBrief() {
    if (todaysCalls.length === 0) return <span>Nothing on the calendar today. Free day — use it.</span>;
    var first = todaysCalls[0];
    var firstT = first.cadence.meeting_time ? formatTime(first.cadence.meeting_time) : "no time set";
    if (todaysCalls.length === 1) {
      return (
        <span>
          One call today —{" "}
          <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
            {first.account.name}
          </Glow>{" "}
          at <strong style={{ color: C.text, fontWeight: 600 }}>{firstT}</strong>. I'll prep you.
        </span>
      );
    }
    var second = todaysCalls[1];
    var secondT = second.cadence.meeting_time ? formatTime(second.cadence.meeting_time) : "no time set";
    if (todaysCalls.length === 2) {
      return (
        <span>
          Two calls today —{" "}
          <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
            {first.account.name}
          </Glow>{" "}
          at {firstT}, then{" "}
          <Glow onClick={function () { onOpenCadenceHub(second.account.id, second.cadence.id); }}>
            {second.account.name}
          </Glow>{" "}
          at {secondT}. I'll prep both.
        </span>
      );
    }
    return (
      <span>
        {todaysCalls.length} calls today. First up:{" "}
        <Glow onClick={function () { onOpenCadenceHub(first.account.id, first.cadence.id); }}>
          {first.account.name}
        </Glow>{" "}
        at {firstT}.{" "}
        {todaysCalls.length - 1} more after.
      </span>
    );
  }

  function kindTab(kind) {
    if (kind === "item")    return "tasks";
    if (kind === "project") return "projects";
    return "overview";
  }

  function burningBrief() {
    if (burningRows.length === 0) return <span>Nothing on fire. Clean board.</span>;
    var r1 = burningRows[0];
    var r1Name = acctName(accountById, r1.accountId);
    if (burningRows.length === 1) {
      return (
        <span>
          One thing needs eyes —{" "}
          <Glow onClick={function () { onOpenAccountTab(r1.accountId, kindTab(r1.kind)); }}>
            {r1.left}
          </Glow>{" "}
          on {r1Name}, {r1.right}.
        </span>
      );
    }
    var r2 = burningRows[1];
    var r2Name = acctName(accountById, r2.accountId);
    if (burningRows.length === 2) {
      return (
        <span>
          Two things to handle —{" "}
          <Glow onClick={function () { onOpenAccountTab(r1.accountId, kindTab(r1.kind)); }}>
            {r1.left}
          </Glow>{" "}
          ({r1Name}, {r1.right}) and{" "}
          <Glow onClick={function () { onOpenAccountTab(r2.accountId, kindTab(r2.kind)); }}>
            {r2.left}
          </Glow>{" "}
          ({r2Name}).
        </span>
      );
    }
    return (
      <span>
        {burningRows.length} things piling up. Worst is{" "}
        <Glow onClick={function () { onOpenAccountTab(r1.accountId, kindTab(r1.kind)); }}>
          {r1.left}
        </Glow>{" "}
        on {r1Name} — {r1.right}. {burningRows.length - 1} more behind it.
      </span>
    );
  }

  function looseEndsBrief() {
    if (looseEnds.length === 0) return <span>No drafts hanging around. Clean.</span>;
    var d1 = looseEnds[0];
    var d1Name = acctName(accountById, d1.accountId);
    if (looseEnds.length === 1) {
      return (
        <span>
          A{" "}
          <Glow onClick={function () {
            if (d1.cadenceId) onOpenCadenceHub(d1.accountId, d1.cadenceId);
            else onOpenAccount(d1.accountId);
          }}>
            {d1Name} draft
          </Glow>{" "}
          from {d1.right} is sitting unsummarized. Want me to clean it up?
        </span>
      );
    }
    return (
      <span>
        {looseEnds.length} drafts sitting. Oldest is{" "}
        <Glow onClick={function () {
          if (d1.cadenceId) onOpenCadenceHub(d1.accountId, d1.cadenceId);
          else onOpenAccount(d1.accountId);
        }}>
          {d1Name}
        </Glow>{" "}
        from {d1.right}.
      </span>
    );
  }

  function aheadBrief() {
    if (aheadRows.length === 0) return <span>Quiet week ahead. Nothing to flag.</span>;
    var a1 = aheadRows[0];
    var a1Name = acctName(accountById, a1.accountId);
    if (aheadRows.length === 1) {
      return (
        <span>
          <Glow onClick={function () {
            if (a1.cadenceId) onOpenCadenceHub(a1.accountId, a1.cadenceId);
            else onOpenAccount(a1.accountId);
          }}>
            {a1Name}
          </Glow>{" "}
          is up in {a1.right} — want a draft started so context piles up?
        </span>
      );
    }
    var a2 = aheadRows[1];
    var a2Name = acctName(accountById, a2.accountId);
    if (aheadRows.length === 2) {
      return (
        <span>
          <Glow onClick={function () {
            if (a1.cadenceId) onOpenCadenceHub(a1.accountId, a1.cadenceId);
            else onOpenAccount(a1.accountId);
          }}>
            {a1Name}
          </Glow>{" "}
          in {a1.right}, then{" "}
          <Glow onClick={function () {
            if (a2.cadenceId) onOpenCadenceHub(a2.accountId, a2.cadenceId);
            else onOpenAccount(a2.accountId);
          }}>
            {a2Name}
          </Glow>{" "}
          in {a2.right}. I can start drafts so context piles up.
        </span>
      );
    }
    return (
      <span>
        {aheadRows.length} cadences coming. Closest is{" "}
        <Glow onClick={function () {
          if (a1.cadenceId) onOpenCadenceHub(a1.accountId, a1.cadenceId);
          else onOpenAccount(a1.accountId);
        }}>
          {a1Name}
        </Glow>{" "}
        in {a1.right}.
      </span>
    );
  }

  var callsPanel   = <Panel title="Today's Calls" accent={C.accent}>{todaysCallsBrief()}</Panel>;
  var burningPanel = <Panel title="Burning"       accent={C.red}>{burningBrief()}</Panel>;
  var loosePanel   = <Panel title="Loose Ends"    accent={C.yellow}>{looseEndsBrief()}</Panel>;
  var aheadPanel   = <Panel title="Ahead"         accent={C.accent}>{aheadBrief()}</Panel>;

  var mobileOrder  = [burningPanel, callsPanel, loosePanel, aheadPanel];
  var desktopOrder = [callsPanel, burningPanel, loosePanel, aheadPanel];

  return (
    <div style={{ position: "relative", minHeight: "100%", paddingBottom: isMobile ? 150 : 32 }}>
      <div style={{ padding: isMobile ? "16px 16px 0" : "28px 32px 0", textAlign: "center" }}>
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 26 : 34,
          color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1,
        }}>
          {timeOfDayGreeting(userName)}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 10.5, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 6,
        }}>
          {dateLabel()}
        </div>
      </div>

      {showOnboardingCard && (
        <div style={{
          maxWidth: 600,
          margin: isMobile ? "12px 16px 0" : "16px auto 0",
          padding: "14px 16px",
          background: C.surface,
          border: "1px solid " + C.rule,
          borderLeft: "3px solid " + C.accent,
          borderRadius: 10,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Pip · Just for you
          </div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, lineHeight: 1.55, marginBottom: 12 }}>
            Pip would love to learn a bit about you and your world — it makes every brief, summary, and suggestion sharper.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={onStartInterview}
              style={{
                background: C.accentDeep,
                border: "1px solid " + C.accent,
                borderRadius: 7,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: C.bg,
                fontFamily: INTER,
                cursor: "pointer",
              }}
            >
              {"Let's go →"}
            </button>
            <button
              type="button"
              onClick={onDismissOnboardingCard}
              style={{
                background: "none",
                border: "none",
                color: C.textMuted,
                fontSize: 12,
                fontFamily: INTER,
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}

      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: isMobile ? 16 : 20,
        padding: isMobile ? "24px 16px 28px" : "32px 32px 36px",
      }}>
        <PipOrb size="xxl" sonar />
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 18 : 22,
          color: C.text, lineHeight: 1.45, letterSpacing: "-0.01em",
          textAlign: "center", maxWidth: 580,
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.2s",
        }}>
          {heroLine}
        </div>
        <div style={{
          display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.35s",
        }}>
          <LitPill onClick={function () {
            if (todaysCalls.length > 0) onOpenCadenceHub(todaysCalls[0].account.id, todaysCalls[0].cadence.id);
          }}>
            {todaysCalls.length > 0 ? "Open brief →" : "No brief today"}
          </LitPill>
          <div style={{ position: "relative" }}>
            <LitPill onClick={function () { setCaptureMenuOpen(function (prev) { return !prev; }); }}>
              Quick capture +
            </LitPill>
            {captureMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  background: C.surface,
                  border: "1px solid " + C.rule,
                  borderRadius: 8,
                  boxShadow: "var(--c-overlay-shadow, 0 4px 16px rgba(0,0,0,0.3))",
                  zIndex: 120,
                  minWidth: 160,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={function () { setCaptureMenuOpen(false); if (onOpenConversation) onOpenConversation(); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", fontSize: 13,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    color: C.text, background: "transparent",
                    border: "none", cursor: "pointer",
                    borderBottom: "1px solid " + C.rule,
                  }}
                >
                  Log conversation
                </button>
                <button
                  onClick={function () { setCaptureMenuOpen(false); if (onOpenQuickTask) onOpenQuickTask(); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", fontSize: 13,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    color: C.text, background: "transparent",
                    border: "none", cursor: "pointer",
                  }}
                >
                  Quick task
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {(dailyBrief || briefLoading) && (
        <div style={{
          padding: isMobile ? "0 12px 12px" : "0 32px 12px",
          maxWidth: 980, margin: "0 auto",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.4s ease 0.4s",
        }}>
          <div style={{
            background: C.surface,
            border: "1px solid " + C.rule,
            borderLeft: "2px solid " + C.accent,
            borderRadius: 12,
            padding: "14px 16px 16px",
          }}>
            <div style={{
              fontFamily: MONO, fontSize: 10, color: C.accent,
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
              marginBottom: 8,
            }}>
              Pip · Daily Brief
            </div>
            {briefLoading
              ? <div style={{ fontFamily: INTER, fontSize: 14, color: C.textMuted, lineHeight: 1.6 }}>Pip is thinking…</div>
              : (
                <div>
                  <div style={{ fontFamily: INTER, fontSize: 14, color: C.textSoft, lineHeight: 1.7 }}>
                    {renderBriefWithGlows(dailyBrief, accounts, onOpenAccount)}
                  </div>
                  {briefCallouts && briefCallouts.length > 0 && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      {briefCallouts.map(function (c, i) {
                        var acc = (accounts || []).find(function (a) { return a.name === c.account_name; });
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em", flexShrink: 0 }}>↳</span>
                            {acc
                              ? <Glow onClick={function () { onOpenAccount(acc.id); }}>{c.account_name}</Glow>
                              : <span style={{ fontFamily: INTER, fontSize: 13, color: C.accent }}>{c.account_name}</span>
                            }
                            {c.reason && (
                              <span style={{ fontFamily: INTER, fontSize: 13, color: C.textMuted }}>— {c.reason}</span>
                            )}
                            {c.item && (
                              <span style={{ fontFamily: INTER, fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>· "{c.item}"</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* Commitment nudge card — amber warning for ✦ commitments due soon or overdue */}
      {commitmentNudges.length > 0 && (function () {
        var n = commitmentNudges[0];
        var dueLabel = n.isOverdue
          ? Math.abs(n.daysUntilDue) + "d overdue"
          : n.daysUntilDue === 0 ? "due today"
          : n.daysUntilDue === 1 ? "due tomorrow"
          : "due in " + n.daysUntilDue + "d";
        return (
          <div style={{
            maxWidth: 600,
            margin: isMobile ? "0 16px 12px" : "0 auto 12px",
            background: "rgba(251,191,36,0.07)",
            border: "1px solid rgba(251,191,36,0.25)",
            borderRadius: 10,
            padding: "14px 16px",
          }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.yellow, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
              {"✦ Commitment · " + dueLabel}
            </div>
            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.4, marginBottom: 10 }}>
              {n.title}
              {n.accountName ? <span style={{ color: C.textMuted }}>{" · " + n.accountName}</span> : null}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={function () { if (onMarkNudgeDone) onMarkNudgeDone(n.taskId); }}
                style={{ background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6, padding: "5px 12px", fontFamily: MONO, fontSize: 11, color: C.accent, cursor: "pointer" }}
              >
                {"Mark done ✓"}
              </button>
              <button
                onClick={function () { if (onSnoozeNudge) onSnoozeNudge(n.taskId); }}
                style={{ background: "none", border: "1px solid " + C.rule, borderRadius: 6, padding: "5px 12px", fontFamily: MONO, fontSize: 11, color: C.textMuted, cursor: "pointer" }}
              >
                Snooze
              </button>
              {commitmentNudges.length > 1 && (
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, alignSelf: "center" }}>
                  {"+" + (commitmentNudges.length - 1) + " more"}
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Drip question card — between daily brief and four-panel grid */}
      {dripQuestion && (
        <div style={{
          maxWidth: 600,
          margin: isMobile ? "0 16px 12px" : "0 auto 12px",
          padding: "16px",
          background: C.surface,
          border: "1px solid " + C.rule,
          borderLeft: "3px solid " + C.accent,
          borderRadius: 12,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            {"Pip's Curious"}
          </div>
          <div style={{ fontFamily: INTER, fontSize: 14, color: C.text, lineHeight: 1.55, marginBottom: 12 }}>
            {dripQuestion.question_text}
          </div>
          <textarea
            value={dripAnswer}
            onChange={function (e) { setDripAnswer(e.target.value); }}
            placeholder="Your answer…"
            rows={2}
            style={{
              width: "100%",
              fontSize: 16,
              fontFamily: INTER,
              color: C.text,
              background: C.bg,
              border: "1px solid " + C.rule,
              borderRadius: 7,
              padding: "9px 12px",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              disabled={!dripAnswer.trim() || dripSaving}
              onClick={function () {
                if (!dripAnswer.trim() || dripSaving) return;
                setDripSaving(true);
                var p = onAnswerDrip ? onAnswerDrip(dripQuestion.id, dripAnswer.trim()) : Promise.resolve();
                (p || Promise.resolve()).then(function () {
                  setDripSaving(false);
                  setDripAnswer("");
                }).catch(function () { setDripSaving(false); });
              }}
              style={{
                background: C.accentDeep,
                border: "1px solid " + C.accent,
                borderRadius: 7,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: C.bg,
                fontFamily: INTER,
                cursor: dripAnswer.trim() && !dripSaving ? "pointer" : "not-allowed",
                opacity: dripAnswer.trim() && !dripSaving ? 1 : 0.5,
              }}
            >
              {dripSaving ? "Saving…" : "Answer"}
            </button>
            <button
              type="button"
              onClick={function () { if (onSkipDrip) onSkipDrip(dripQuestion.id); }}
              style={{
                background: "none", border: "none",
                color: C.textMuted, fontSize: 12,
                fontFamily: INTER, cursor: "pointer", padding: "4px 0",
              }}
            >
              Skip
            </button>
            <button
              type="button"
              onClick={function () { if (onDismissDrip) onDismissDrip(dripQuestion.id); }}
              style={{
                background: "none", border: "none",
                color: C.textMuted, fontSize: 12,
                fontFamily: INTER, cursor: "pointer", padding: "4px 0",
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div style={{
        padding: isMobile ? "0 12px 16px" : "0 32px 24px",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: isMobile ? 10 : 14,
        maxWidth: 980, margin: "0 auto",
      }}>
        {(isMobile ? mobileOrder : desktopOrder).map(function (panel, i) {
          return (
            <div
              key={i}
              style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? "translateY(0)" : "translateY(6px)",
                transition: "opacity 0.32s ease " + (0.45 + i * 0.08) + "s, transform 0.32s ease " + (0.45 + i * 0.08) + "s",
              }}
            >
              {panel}
            </div>
          );
        })}
      </div>

      {isMobile && (
        <div style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)",
          padding: "10px 12px 12px",
          background: C.bg,
          borderTop: "1px solid " + C.rule,
          boxShadow: "0 -8px 18px -10px rgba(0,0,0,0.5)",
          display: "flex", gap: 8, zIndex: 49,
        }}>
          <button
            onClick={function () { if (onOpenConversation) onOpenConversation(); }}
            style={{
              flex: 1, background: C.surface,
              border: "1px solid " + C.rule, borderRadius: 8,
              padding: "11px 12px", color: C.textSoft,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Touchpoint
          </button>
          <button
            onClick={function () { if (onOpenQuickTask) onOpenQuickTask(); }}
            style={{
              flex: 1, background: C.surface,
              border: "1px solid " + C.rule, borderRadius: 8,
              padding: "11px 12px", color: C.textSoft,
              fontFamily: INTER, fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Task
          </button>
        </div>
      )}
    </div>
  );
}
