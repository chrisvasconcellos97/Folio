import { useState, useEffect, useMemo } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { LitPill } from "../../components/LitPill";
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

function PanelRow({ left, right, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 10, width: "100%",
        background: "transparent",
        border: "1px solid " + C.rule,
        borderLeft: "2px solid " + (accent || C.accentDim),
        borderRadius: 8,
        padding: "9px 11px",
        cursor: onClick ? "pointer" : "default",
        fontFamily: INTER,
        textAlign: "left",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: C.text, fontWeight: 500 }}>
        {left}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: accent || C.textMuted, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        {right}
      </div>
    </button>
  );
}

function Panel({ title, subtitle, accent, children, isEmpty, emptyText }) {
  return (
    <div style={{
      background: C.surface,
      border: "1px solid " + C.rule,
      borderRadius: 12,
      padding: "16px 18px",
      minHeight: 160,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, color: accent || C.textMuted,
          fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          {title}
        </div>
      </div>
      <div style={{
        fontFamily: INTER, fontSize: 12.5, color: C.textSoft,
        fontStyle: "italic", lineHeight: 1.4, marginTop: -4,
      }}>
        {subtitle}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, justifyContent: isEmpty ? "center" : "flex-start", alignItems: isEmpty ? "center" : "stretch" }}>
        {isEmpty ? (
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, opacity: 0.6 }}>
            {emptyText || "empty for now"}
          </div>
        ) : children}
      </div>
    </div>
  );
}

export function HomeView({ accounts, meetings, items, cadences, projects, onOpenAccount, onOpenCadenceHub, onOpenConversation }) {
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
  var callsPanel = (
    <Panel
      title="Today's Calls"
      subtitle={"I'll prep you."}
      accent={C.accent}
      isEmpty={todaysCalls.length === 0}
      emptyText="No calls scheduled today."
    >
      {todaysCalls.map(function (c) {
        var t = c.cadence.meeting_time ? formatTime(c.cadence.meeting_time) : "anytime";
        return (
          <PanelRow
            key={c.cadence.id}
            left={c.account.name}
            right={t}
            accent={C.accent}
            onClick={function () { onOpenCadenceHub(c.account.id, c.cadence.id); }}
          />
        );
      })}
    </Panel>
  );

  var burningPanel = (
    <Panel
      title="Burning"
      subtitle="These need eyes."
      accent={C.red}
      isEmpty={burningRows.length === 0}
      emptyText="All clear. Nothing on fire."
    >
      {burningRows.map(function (r) {
        return (
          <PanelRow
            key={r.key}
            left={r.left}
            right={r.right}
            accent={C.red}
            onClick={function () { onOpenAccount(r.accountId); }}
          />
        );
      })}
    </Panel>
  );

  var loosePanel = (
    <Panel
      title="Loose Ends"
      subtitle="Let me clean these up."
      accent={C.yellow}
      isEmpty={looseEnds.length === 0}
      emptyText="No drafts hanging around."
    >
      {looseEnds.map(function (r) {
        return (
          <PanelRow
            key={r.key}
            left={r.left}
            right={r.right}
            accent={C.yellow}
            onClick={function () {
              if (r.cadenceId) onOpenCadenceHub(r.accountId, r.cadenceId);
              else onOpenAccount(r.accountId);
            }}
          />
        );
      })}
    </Panel>
  );

  var aheadPanel = (
    <Panel
      title="Ahead"
      subtitle="While you weren't looking."
      accent={C.accent}
      isEmpty={aheadRows.length === 0}
      emptyText="No upcoming work I can prep yet."
    >
      {aheadRows.map(function (r) {
        return (
          <PanelRow
            key={r.key}
            left={r.left}
            right={r.right}
            accent={C.accent}
            onClick={function () {
              if (r.cadenceId) onOpenCadenceHub(r.accountId, r.cadenceId);
              else onOpenAccount(r.accountId);
            }}
          />
        );
      })}
    </Panel>
  );

  var mobileOrder  = [burningPanel, callsPanel, loosePanel, aheadPanel];
  var desktopOrder = [callsPanel, burningPanel, loosePanel, aheadPanel];

  return (
    <div style={{ position: "relative", minHeight: "100%", paddingBottom: isMobile ? 80 : 32 }}>
      <div style={{ padding: isMobile ? "16px 16px 0" : "28px 32px 0", textAlign: "center" }}>
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 26 : 34,
          color: C.text, letterSpacing: "-0.02em", lineHeight: 1.1,
        }}>
          {timeOfDayGreeting()}
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
          left: 0, right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
          padding: "8px 12px",
          background: C.bg,
          borderTop: "1px solid " + C.rule,
          display: "flex", gap: 8, zIndex: 50,
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
