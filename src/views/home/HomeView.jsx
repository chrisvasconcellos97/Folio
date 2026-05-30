import { useState, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { LitPill } from "../../components/LitPill";
import { Glow } from "../../components/Glow";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { getNextOccurrence, formatTime } from "../../lib/cadenceUtils";

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

export function HomeView({ userName, accounts, meetings, items, cadences, projects, onOpenAccount, onOpenCadenceHub, onOpenConversation }) {
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;
  var [mounted, setMounted] = useState(false);

  useEffect(function () {
    var t = setTimeout(function () { setMounted(true); }, 60);
    return function () { clearTimeout(t); };
  }, []);

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

  function burningBrief() {
    if (burningRows.length === 0) return <span>Nothing on fire. Clean board.</span>;
    var r1 = burningRows[0];
    var r1Name = acctName(accountById, r1.accountId);
    if (burningRows.length === 1) {
      return (
        <span>
          One thing needs eyes —{" "}
          <Glow onClick={function () { onOpenAccount(r1.accountId); }}>
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
          <Glow onClick={function () { onOpenAccount(r1.accountId); }}>
            {r1.left}
          </Glow>{" "}
          ({r1Name}, {r1.right}) and{" "}
          <Glow onClick={function () { onOpenAccount(r2.accountId); }}>
            {r2.left}
          </Glow>{" "}
          ({r2Name}).
        </span>
      );
    }
    return (
      <span>
        {burningRows.length} things piling up. Worst is{" "}
        <Glow onClick={function () { onOpenAccount(r1.accountId); }}>
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
          <LitPill onClick={function () { if (onOpenConversation) onOpenConversation(); }}>
            Quick capture +
          </LitPill>
        </div>
      </div>

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
          right: 88, /* clear the 52px Pip orb floating at right:20 */
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)",
          padding: "10px 12px 12px",
          background: C.bg,
          borderTop: "1px solid " + C.rule,
          borderRight: "1px solid " + C.rule,
          borderTopRightRadius: 12,
          borderBottomRightRadius: 12,
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
            onClick={function () {}}
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
