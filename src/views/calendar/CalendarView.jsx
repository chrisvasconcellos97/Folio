import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { Mark } from "../../components/Mark";
import { PipOrb } from "../../components/PipMark";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import {
  isSameDay,
  getCalendarGrid,
  getOccurrencesInRange,
  DAYS_SHORT,
  DAYS_FULL,
  MONTHS,
  formatTime,
} from "../../lib/cadenceUtils";

var SERIF = "'Fraunces', Georgia, serif";
var INTER = "'Inter', system-ui, sans-serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// ── Date helpers ────────────────────────────────────────────────────────────

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date) {
  var d = new Date(date); d.setHours(0, 0, 0, 0); return d;
}

function addDays(date, n) {
  var d = new Date(date); d.setDate(d.getDate() + n); return d;
}

function startOfWeekSun(date) {
  var d = new Date(date);
  var dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(d) {
  // Parse an ISO date string (YYYY-MM-DD) as local midnight to avoid TZ shift
  if (!d) return null;
  var parts = String(d).slice(0, 10).split("-");
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

var METHOD_LABEL = { phone: "Phone", email: "Email", video: "Video", in_person: "In Person" };

// Pick a useful title to show in the calendar. Order:
//   1. User-set title (only if they actually picked one — not the
//      auto-generated date-stamped strings)
//   2. pip_short_title — Pip's 3-4 word email-subject-style label
//   3. method + account fallback ("Email · Empire")
//
// Old fallbacks (notes first line / pip_summary first sentence) are
// gone — too verbose on a date-indexed surface. The short title is the
// signal; click the row for the full summary.
function meetingDisplayTitle(m, acct) {
  var title = (m.title || "").trim();
  var isAuto = /^(Conversation|Email|Meeting)\s+—\s+\w+\s+\d+/.test(title);
  if (title && !isAuto) return title;
  var shortTitle = (m.pip_short_title || "").trim();
  if (shortTitle) return shortTitle;
  var label = METHOD_LABEL[m.method] || "";
  if (acct && label) return label + " · " + acct.name;
  if (acct) return acct.name;
  return "Meeting";
}

// ── Event aggregation ────────────────────────────────────────────────────────

// Returns array of unified events for a date range [startDate, endDate] (inclusive).
// Each event: { id, type, date, timeStr, title, accountId, accountName, cadenceId, itemId, taskId, color }
function buildEvents({ meetings, cadences, items, projects, quickTasks, accounts, filter, startDate, endDate }) {
  var accountById = {};
  (accounts || []).forEach(function (a) { accountById[a.id] = a; });

  var events = [];
  var start  = startOfDay(startDate);
  var end    = startOfDay(endDate);
  end.setHours(23, 59, 59);

  var showMeetings  = filter === "all" || filter === "meetings";
  var showTasks     = filter === "all" || filter === "tasks";
  var showCadences  = filter === "all" || filter === "cadences";

  // ── Logged meetings ──────────────────────────────────────────────────────
  if (showMeetings) {
    (meetings || []).forEach(function (m) {
      if (!m.meeting_date) return;
      var d = isoDate(m.meeting_date);
      if (!d || d < start || d > end) return;
      var acct = accountById[m.account_id] || null;
      events.push({
        id: "meeting:" + m.id,
        type: "meeting",
        date: d,
        timeStr: m.meeting_time ? formatTime(m.meeting_time) : null,
        title: meetingDisplayTitle(m, acct),
        accountId: m.account_id,
        accountName: acct ? acct.name : null,
        cadenceId: m.cadence_id || null,
        color: C.accent,
        meeting: m,
      });
    });
  }

  // ── Cadence occurrences (not yet logged) ─────────────────────────────────
  if (showCadences || showMeetings) {
    (cadences || []).forEach(function (c) {
      if (c.type === "task") return;
      var occurrences = getOccurrencesInRange(c, start, end);
      occurrences.forEach(function (occ) {
        // Check if a meeting was already logged for this cadence on this date
        var hasLogged = (meetings || []).some(function (m) {
          return m.cadence_id === c.id && m.meeting_date && isSameDay(isoDate(m.meeting_date), occ);
        });
        if (hasLogged) return; // meeting already shown above
        var acct = accountById[c.account_id] || null;
        events.push({
          id: "cadence:" + c.id + ":" + toISO(occ),
          type: "cadence",
          date: occ,
          timeStr: c.meeting_time ? formatTime(c.meeting_time) : null,
          title: acct ? acct.name + " — cadence" : "Cadence",
          accountId: c.account_id,
          accountName: acct ? acct.name : null,
          cadenceId: c.id,
          color: C.accent,
          cadence: c,
          missed: occ < startOfDay(new Date()),
        });
      });
    });
  }

  // ── Open items due ───────────────────────────────────────────────────────
  if (showTasks) {
    (items || []).forEach(function (item) {
      if (item.done || !item.due_date) return;
      var d = isoDate(item.due_date);
      if (!d || d < start || d > end) return;
      var acct = accountById[item.account_id] || null;
      events.push({
        id: "item:" + item.id,
        type: "item",
        date: d,
        timeStr: null,
        title: item.text,
        accountId: item.account_id,
        accountName: acct ? acct.name : null,
        color: C.yellow,
        item: item,
      });
    });

    // ── Gauge tasks due ──────────────────────────────────────────────────
    (projects || []).forEach(function (p) {
      var acct = accountById[p.account_id] || null;
      (p.stages || []).forEach(function (task) {
        if (task.status === "complete" || !task.due_date) return;
        var cf = task.custom_fields || {};
        var dueKey = Object.keys(cf).find(function (k) { return k.toLowerCase().includes("due"); });
        var rawDue = dueKey ? cf[dueKey] : task.due_date;
        if (!rawDue) return;
        var d = isoDate(rawDue);
        if (!d || d < start || d > end) return;
        events.push({
          id: "task:" + p.id + ":" + task.id,
          type: "task",
          date: d,
          timeStr: null,
          title: task.title || "Task",
          accountId: p.account_id,
          accountName: acct ? acct.name : null,
          projectId: p.id,
          color: C.blue,
          task: task,
          project: p,
        });
      });
    });

    // ── Quick tasks reminded ─────────────────────────────────────────────
    (quickTasks || []).forEach(function (qt) {
      if (qt.completed) return;
      var raw = qt.reminder_date || qt.due_date;
      if (!raw) return;
      var d = isoDate(raw);
      if (!d || d < start || d > end) return;
      events.push({
        id: "quicktask:" + qt.id,
        type: "quicktask",
        date: d,
        timeStr: null,
        title: qt.text,
        accountId: qt.account_id || null,
        accountName: qt.account_id ? (accountById[qt.account_id] ? accountById[qt.account_id].name : null) : null,
        color: C.purple,
        quickTask: qt,
      });
    });
  }

  // Sort by time within each day
  events.sort(function (a, b) {
    if (!isSameDay(a.date, b.date)) return a.date - b.date;
    var ta = a.timeStr || "23:59";
    var tb = b.timeStr || "23:59";
    return ta.localeCompare(tb);
  });

  return events;
}

// ── Pip one-liner builders ──────────────────────────────────────────────────

function dailyPipLine(events, focusedDate) {
  var today   = startOfDay(new Date());
  var isToday = isSameDay(focusedDate, today);
  var first, timeStr;

  var meetings = events.filter(function (e) { return e.type === "meeting" || e.type === "cadence"; });
  var due      = events.filter(function (e) { return e.type === "item" || e.type === "task" || e.type === "quicktask"; });

  if (meetings.length === 0 && due.length === 0) {
    return isToday ? "Free day. Use it." : "Nothing scheduled.";
  }
  if (meetings.length > 0 && due.length === 0) {
    first   = meetings[0];
    timeStr = first.timeStr ? " at " + first.timeStr : "";
    if (meetings.length === 1) return first.accountName + timeStr + ". Nothing burning.";
    return meetings.length + " calls" + (isToday ? " today" : "") + ". " + first.accountName + timeStr + " leads.";
  }
  if (meetings.length === 0 && due.length > 0) {
    return "Quiet calendar — but " + due.length + " thing" + (due.length !== 1 ? "s" : "") + " need" + (due.length === 1 ? "s" : "") + " your eyes.";
  }
  first   = meetings[0];
  timeStr = first.timeStr ? " at " + first.timeStr : "";
  return meetings.length + " call" + (meetings.length !== 1 ? "s" : "") + ", " + due.length + " due. " + first.accountName + timeStr + " leads.";
}

function weeklyPipLine(events) {
  var meetings = events.filter(function (e) { return e.type === "meeting" || e.type === "cadence"; });
  var due      = events.filter(function (e) { return e.type === "item" || e.type === "task"; });

  if (meetings.length === 0 && due.length === 0) return "Clear week. Nothing flagged.";
  if (meetings.length === 0) return "No calls this week — but " + due.length + " thing" + (due.length !== 1 ? "s" : "") + " due.";

  // Find busiest day
  var dayCounts = {};
  meetings.forEach(function (e) {
    var key = toISO(e.date);
    dayCounts[key] = (dayCounts[key] || 0) + 1;
  });
  var busiestKey = Object.keys(dayCounts).sort(function (a, b) { return dayCounts[b] - dayCounts[a]; })[0];
  var busiestDay = DAYS_FULL[new Date(busiestKey + "T00:00:00").getDay()];

  if (due.length === 0) {
    return meetings.length + " call" + (meetings.length !== 1 ? "s" : "") + " this week. " + busiestDay + " is busiest.";
  }
  return meetings.length + " call" + (meetings.length !== 1 ? "s" : "") + " this week, " + due.length + " task" + (due.length !== 1 ? "s" : "") + " due. " + busiestDay + " is the bottleneck.";
}

function monthlyPipLine(events, cadences, accounts) {
  var calMeetings = events.filter(function (e) { return e.type === "cadence"; });
  var due         = events.filter(function (e) { return e.type === "item" || e.type === "task"; });
  var coldCount   = (accounts || []).filter(function (a) {
    if (a.is_inactive) return false;
    var last = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
    if (!last) return false;
    return Math.floor((Date.now() - last) / 86400000) > 30;
  }).length;

  var parts = [];
  if (calMeetings.length > 0) parts.push(calMeetings.length + " cadence" + (calMeetings.length !== 1 ? "s" : "") + " scheduled");
  if (due.length > 0)         parts.push(due.length + " item" + (due.length !== 1 ? "s" : "") + " due");
  if (coldCount > 0)          parts.push(coldCount + " account" + (coldCount !== 1 ? "s" : "") + " gone cold");
  if (parts.length === 0) return "Quiet month. Nothing flagged.";
  return parts.join(", ") + ".";
}

// ── Shared sub-components ───────────────────────────────────────────────────

function PipLine({ text }) {
  if (!text) return null;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      background: C.accentGlow,
      border: "1px solid " + C.accentLine,
      borderRadius: 12,
      padding: "12px 14px",
      marginBottom: 14,
    }}>
      <div style={{ flexShrink: 0, marginTop: 1 }}>
        <PipOrb size="sm" sonar />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 9.5, color: C.accent, fontWeight: 700,
          letterSpacing: "0.09em", textTransform: "uppercase",
          marginBottom: 4,
        }}>
          Pip
        </div>
        <div style={{
          fontFamily: SERIF,
          fontSize: 14.5,
          color: C.text,
          lineHeight: 1.55,
          letterSpacing: "-0.005em",
        }}>
          {text}
        </div>
      </div>
    </div>
  );
}

function EventRow({ event, onClick, showAccount }) {
  var leftColor = event.color || C.accent;
  var faded     = event.missed;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick && onClick(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        opacity: faded ? 0.45 : 1,
        background: C.surface,
        border: "1px solid " + C.rule,
        transition: "background 0.12s",
        userSelect: "none",
      }}
      onMouseEnter={function (e) { e.currentTarget.style.background = C.surface2; }}
      onMouseLeave={function (e) { e.currentTarget.style.background = C.surface; }}
    >
      <div style={{
        width: 3,
        alignSelf: "stretch",
        borderRadius: 2,
        background: leftColor,
        flexShrink: 0,
        minHeight: 18,
      }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{
          fontFamily: INTER,
          fontSize: 13,
          fontWeight: 600,
          color: C.text,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {event.title}
        </div>
        {event.accountName && (
          <span style={{
            display: "inline-flex", alignItems: "center",
            fontFamily: MONO, fontSize: 9.5, color: C.textSoft,
            background: C.surface2,
            border: "1px solid " + C.rule,
            borderRadius: 999,
            padding: "1px 8px",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {event.accountName}
          </span>
        )}
      </div>
      {event.timeStr && (
        <div style={{
          fontFamily: MONO, fontSize: 11, color: C.textMuted,
          flexShrink: 0, fontVariantNumeric: "tabular-nums",
        }}>
          {event.timeStr}
        </div>
      )}
      {event.missed && (
        <div style={{
          fontFamily: MONO, fontSize: 9, color: C.textMuted,
          textTransform: "uppercase", letterSpacing: "0.08em",
          flexShrink: 0, border: "1px solid " + C.rule,
          borderRadius: 3, padding: "1px 4px",
        }}>
          missed
        </div>
      )}
    </div>
  );
}

function SectionLabel({ label, accent }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.1em",
      color: accent || C.textMuted,
      marginBottom: 4,
      marginTop: 10,
    }}>
      {label}
    </div>
  );
}

function QuickAddButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "1px dashed " + C.rule,
        borderRadius: 8,
        padding: "7px 12px",
        fontFamily: INTER, fontSize: 12, color: C.textMuted,
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6,
        transition: "border-color 0.12s, color 0.12s",
      }}
      onMouseEnter={function (e) {
        e.currentTarget.style.borderColor = C.accentLine;
        e.currentTarget.style.color = C.accent;
      }}
      onMouseLeave={function (e) {
        e.currentTarget.style.borderColor = C.rule;
        e.currentTarget.style.color = C.textMuted;
      }}
    >
      + {label}
    </button>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function CalendarHeader({
  viewMode, setViewMode,
  focusedDate, onPrev, onToday, onNext,
  filter, setFilter,
  isMobile,
}) {
  var label = "";
  if (viewMode === "daily") {
    var now = new Date();
    if (isSameDay(focusedDate, now)) label = "Today";
    else if (isSameDay(focusedDate, addDays(now, 1))) label = "Tomorrow";
    else label = DAYS_FULL[focusedDate.getDay()] + ", " + MONTHS[focusedDate.getMonth()] + " " + focusedDate.getDate();
  } else if (viewMode === "weekly") {
    var wsun = startOfWeekSun(focusedDate);
    var wsat = addDays(wsun, 6);
    if (wsun.getMonth() === wsat.getMonth()) {
      label = MONTHS[wsun.getMonth()].slice(0, 3) + " " + wsun.getDate() + "–" + wsat.getDate();
    } else {
      label = MONTHS[wsun.getMonth()].slice(0, 3) + " " + wsun.getDate() + " – " + MONTHS[wsat.getMonth()].slice(0, 3) + " " + wsat.getDate();
    }
  } else {
    label = MONTHS[focusedDate.getMonth()] + " " + focusedDate.getFullYear();
  }

  var navBtnStyle = {
    background: C.surface, border: "1px solid " + C.rule, borderRadius: 6,
    padding: "5px 10px", fontFamily: MONO, fontSize: 13, color: C.text,
    cursor: "pointer", lineHeight: 1,
  };

  var FILTERS = [
    { id: "all",      label: "All"      },
    { id: "meetings", label: "Meetings" },
    { id: "tasks",    label: "Tasks"    },
    { id: "cadences", label: "Cadences" },
  ];

  var MODES = [
    { id: "daily",   label: "Daily"   },
    { id: "weekly",  label: "Weekly"  },
    { id: "monthly", label: "Monthly" },
  ];

  return (
    <div style={{
      padding: isMobile ? "14px 14px 10px" : "20px 28px 12px",
      borderBottom: "1px solid " + C.rule,
      background: C.bg,
      position: "sticky", top: 0, zIndex: 10,
    }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {!isMobile && <Mark tab="meetings" size={32} />}
        <div style={{
          fontFamily: SERIF, fontSize: isMobile ? 22 : 26,
          color: C.text, letterSpacing: "-0.02em", flex: 1,
        }}>
          Calendar
        </div>
        {/* Mode segmented control */}
        <div style={{
          display: "flex", gap: 2,
          background: C.surface,
          border: "1px solid " + C.rule,
          borderRadius: 8, padding: 3,
        }}>
          {MODES.map(function (m) {
            var active = m.id === viewMode;
            return (
              <button
                key={m.id}
                onClick={function () { setViewMode(m.id); }}
                style={{
                  background: active ? C.accentFaint : "none",
                  border: active ? "1px solid " + C.accentSubtle : "1px solid transparent",
                  borderRadius: 5,
                  padding: isMobile ? "4px 8px" : "5px 12px",
                  fontFamily: INTER, fontSize: isMobile ? 11 : 12, fontWeight: active ? 700 : 400,
                  color: active ? C.accent : C.textSoft,
                  cursor: "pointer",
                  transition: "all 0.12s",
                  whiteSpace: "nowrap",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Nav row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={onPrev} aria-label="Previous" style={navBtnStyle}>‹</button>
        <button
          onClick={onToday}
          style={{
            background: C.accentFaint, border: "1px solid " + C.accentSubtle,
            borderRadius: 6, padding: "5px 10px",
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            color: C.accent, cursor: "pointer",
          }}
        >
          Today
        </button>
        <button onClick={onNext} aria-label="Next" style={navBtnStyle}>›</button>
        <div style={{
          fontFamily: INTER, fontSize: 14, fontWeight: 600,
          color: C.text, marginLeft: 6, flex: 1,
        }}>
          {label}
        </div>
      </div>
      {/* Filter chips */}
      <div style={{
        display: "flex", gap: 6,
        overflowX: "auto", WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none", msOverflowStyle: "none",
      }}>
        {FILTERS.map(function (f) {
          var active = f.id === filter;
          return (
            <button
              key={f.id}
              onClick={function () { setFilter(f.id); }}
              style={{
                background: active ? C.accentFaint : C.surface,
                border: "1px solid " + (active ? C.accentSubtle : C.rule),
                borderRadius: 20,
                padding: "4px 12px",
                fontFamily: INTER, fontSize: 11, fontWeight: active ? 700 : 400,
                color: active ? C.accent : C.textSoft,
                cursor: "pointer",
                flexShrink: 0,
                transition: "all 0.12s",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily View ───────────────────────────────────────────────────────────────

function DailyView({ focusedDate, events, onOpenAccount, onOpenCadenceHub, onOpenConversation, onAddItem }) {
  var meetings  = events.filter(function (e) { return e.type === "meeting" || e.type === "cadence"; });
  var items     = events.filter(function (e) { return e.type === "item"; });
  var tasks     = events.filter(function (e) { return e.type === "task"; });
  var quickTasks = events.filter(function (e) { return e.type === "quicktask"; });

  var pipText = dailyPipLine(events, focusedDate);
  var prefillDate = toISO(focusedDate);

  function handleEventClick(event) {
    if (event.cadenceId && (event.type === "cadence" || event.type === "meeting")) {
      onOpenCadenceHub && onOpenCadenceHub(event.accountId, event.cadenceId);
    } else if (event.accountId) {
      onOpenAccount && onOpenAccount(event.accountId);
    }
  }

  return (
    <div style={{ padding: "14px 16px 80px", maxWidth: 680, margin: "0 auto" }}>
      <PipLine text={pipText} />

      {/* Meetings & cadences */}
      {meetings.length > 0 && (
        <>
          <SectionLabel label="Meetings & Cadences" accent={C.accent} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {meetings.map(function (e) {
              return <EventRow key={e.id} event={e} onClick={function () { handleEventClick(e); }} showAccount />;
            })}
          </div>
        </>
      )}

      {/* Quick add conversation */}
      <div style={{ marginTop: meetings.length > 0 ? 8 : 16 }}>
        <QuickAddButton label="Log Conversation" onClick={function () {
          if (onOpenConversation) onOpenConversation({ prefillDate });
        }} />
      </div>

      {/* Items due */}
      {items.length > 0 && (
        <>
          <SectionLabel label="Items Due" accent={C.yellow} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {items.map(function (e) {
              return <EventRow key={e.id} event={e} onClick={function () { onOpenAccount && onOpenAccount(e.accountId); }} showAccount />;
            })}
          </div>
        </>
      )}

      {/* Tasks due */}
      {tasks.length > 0 && (
        <>
          <SectionLabel label="Tasks Due" accent={C.blue} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {tasks.map(function (e) {
              return <EventRow key={e.id} event={e} onClick={function () { onOpenAccount && onOpenAccount(e.accountId); }} showAccount />;
            })}
          </div>
        </>
      )}

      {/* Quick tasks */}
      {quickTasks.length > 0 && (
        <>
          <SectionLabel label="Quick Tasks" accent={C.purple} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {quickTasks.map(function (e) {
              return <EventRow key={e.id} event={e} onClick={function () {
                if (e.accountId) onOpenAccount && onOpenAccount(e.accountId);
              }} showAccount />;
            })}
          </div>
        </>
      )}

      {/* Quick add item */}
      {events.length === 0 && (
        <div style={{
          textAlign: "center", padding: "40px 0",
          fontFamily: INTER, fontSize: 13, color: C.textMuted,
        }}>
          Nothing scheduled. Free day.
        </div>
      )}
    </div>
  );
}

// ── Weekly View ──────────────────────────────────────────────────────────────

function WeeklyView({ focusedDate, allEvents, onSetDailyDate, onOpenAccount, onOpenCadenceHub, onOpenConversation, isMobile }) {
  var weekStart = startOfWeekSun(focusedDate);
  var days = [];
  for (var i = 0; i < 7; i++) {
    days.push(addDays(weekStart, i));
  }

  var today  = startOfDay(new Date());
  var pipText = weeklyPipLine(allEvents);

  // Group events by date string
  var byDay = {};
  allEvents.forEach(function (e) {
    var key = toISO(e.date);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(e);
  });

  if (isMobile) {
    // Mobile: vertical stack of days
    return (
      <div style={{ padding: "12px 12px 80px" }}>
        <PipLine text={pipText} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {days.map(function (day) {
            var key    = toISO(day);
            var dayEvts = byDay[key] || [];
            var isToday = isSameDay(day, today);
            return (
              <div key={key} style={{
                background: C.surface,
                border: "1px solid " + (isToday ? C.accentSubtle : C.rule),
                borderRadius: 10,
                overflow: "hidden",
              }}>
                {/* Day header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={function () { onSetDailyDate(day); }}
                  onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") onSetDailyDate(day); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px",
                    background: isToday ? C.accentFaint : C.surface2,
                    borderBottom: dayEvts.length ? "1px solid " + C.rule : "none",
                    cursor: "pointer",
                  }}
                >
                  <div style={{
                    fontFamily: INTER, fontSize: 12, fontWeight: 700,
                    color: isToday ? C.accent : C.textSoft,
                  }}>
                    {DAYS_SHORT[day.getDay()]}
                  </div>
                  <div style={{
                    fontFamily: MONO, fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                    color: isToday ? C.accent : C.text,
                    fontWeight: isToday ? 700 : 400,
                  }}>
                    {day.getDate()}
                  </div>
                  {dayEvts.length > 0 && (
                    <div style={{
                      marginLeft: "auto",
                      fontFamily: MONO, fontSize: 10, color: C.textMuted,
                    }}>
                      {dayEvts.length}
                    </div>
                  )}
                </div>
                {/* Events list */}
                {dayEvts.length > 0 && (
                  <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {dayEvts.slice(0, 4).map(function (ev) {
                      return (
                        <div
                          key={ev.id}
                          role="button"
                          tabIndex={0}
                          onClick={function () {
                            if (ev.cadenceId && (ev.type === "cadence" || ev.type === "meeting")) {
                              onOpenCadenceHub && onOpenCadenceHub(ev.accountId, ev.cadenceId);
                            } else if (ev.accountId) {
                              onOpenAccount && onOpenAccount(ev.accountId);
                            }
                          }}
                          onKeyDown={function (e) { if (e.key === "Enter") e.currentTarget.click(); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 6px", borderRadius: 5,
                            cursor: "pointer",
                            background: "transparent",
                          }}
                          onMouseEnter={function (e) { e.currentTarget.style.background = C.surface2; }}
                          onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: ev.color, flexShrink: 0,
                          }} />
                          <div style={{
                            fontFamily: INTER, fontSize: 12, color: C.textSoft,
                            flex: 1, minWidth: 0,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {ev.title}
                          </div>
                          {ev.timeStr && (
                            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
                              {ev.timeStr}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {dayEvts.length > 4 && (
                      <div style={{
                        fontFamily: MONO, fontSize: 10, color: C.textMuted,
                        padding: "2px 6px",
                      }}>
                        +{dayEvts.length - 4} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop: 7-column grid
  return (
    <div style={{ padding: "12px 20px 40px" }}>
      <PipLine text={pipText} />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 6,
        marginTop: 10,
      }}>
        {days.map(function (day) {
          var key     = toISO(day);
          var dayEvts = byDay[key] || [];
          var isToday  = isSameDay(day, today);
          return (
            <div key={key} style={{
              display: "flex", flexDirection: "column", gap: 4,
              background: C.surface,
              border: "1px solid " + (isToday ? C.accentSubtle : C.rule),
              borderRadius: 10, overflow: "hidden",
              minHeight: 120,
            }}>
              {/* Day header */}
              <div
                role="button"
                tabIndex={0}
                onClick={function () { onSetDailyDate(day); }}
                onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") onSetDailyDate(day); }}
                style={{
                  padding: "8px 8px 6px",
                  background: isToday ? C.accentFaint : C.surface2,
                  borderBottom: "1px solid " + (isToday ? C.accentSubtle : C.rule),
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <div style={{ fontFamily: INTER, fontSize: 10, color: C.textMuted, fontWeight: 600 }}>
                  {DAYS_SHORT[day.getDay()]}
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  color: isToday ? C.accent : C.text,
                  fontWeight: isToday ? 700 : 400,
                }}>
                  {day.getDate()}
                </div>
              </div>
              {/* Events */}
              <div style={{ flex: 1, padding: "4px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
                {dayEvts.slice(0, 5).map(function (ev) {
                  return (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={function () {
                        if (ev.cadenceId && (ev.type === "cadence" || ev.type === "meeting")) {
                          onOpenCadenceHub && onOpenCadenceHub(ev.accountId, ev.cadenceId);
                        } else if (ev.accountId) {
                          onOpenAccount && onOpenAccount(ev.accountId);
                        }
                      }}
                      onKeyDown={function (e) { if (e.key === "Enter") e.currentTarget.click(); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "3px 4px", borderRadius: 4,
                        cursor: "pointer",
                      }}
                      onMouseEnter={function (e) { e.currentTarget.style.background = C.surface2; }}
                      onMouseLeave={function (e) { e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: ev.color, flexShrink: 0,
                      }} />
                      <div style={{
                        fontFamily: INTER, fontSize: 11, color: C.textSoft,
                        flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {ev.timeStr ? ev.timeStr + " " : ""}{ev.accountName || ev.title}
                      </div>
                    </div>
                  );
                })}
                {dayEvts.length > 5 && (
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textMuted, padding: "1px 4px" }}>
                    +{dayEvts.length - 5}
                  </div>
                )}
              </div>
              {/* Quick add */}
              <div style={{ padding: "4px 5px 6px" }}>
                <button
                  onClick={function () {
                    if (onOpenConversation) onOpenConversation({ prefillDate: key });
                  }}
                  style={{
                    width: "100%", background: "none", border: "1px dashed " + C.rule,
                    borderRadius: 4, padding: "3px 0",
                    fontFamily: MONO, fontSize: 9, color: C.textFaint,
                    cursor: "pointer",
                  }}
                  onMouseEnter={function (e) {
                    e.currentTarget.style.borderColor = C.accentLine;
                    e.currentTarget.style.color = C.accent;
                  }}
                  onMouseLeave={function (e) {
                    e.currentTarget.style.borderColor = C.rule;
                    e.currentTarget.style.color = C.textFaint;
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Monthly View ─────────────────────────────────────────────────────────────

function MonthlyView({ focusedDate, allEvents, onSetDailyDate, isMobile }) {
  var year  = focusedDate.getFullYear();
  var month = focusedDate.getMonth();
  var grid  = getCalendarGrid(year, month);
  var today = startOfDay(new Date());

  // Group events by date
  var byDay = {};
  allEvents.forEach(function (e) {
    var key = toISO(e.date);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(e);
  });

  // Collect unique event type colors for dots (up to 3 dot types)
  function getDots(dayEvts) {
    var seen = {};
    var dots = [];
    dayEvts.forEach(function (e) {
      if (!seen[e.color]) {
        seen[e.color] = true;
        dots.push(e.color);
      }
    });
    return dots.slice(0, 3);
  }

  var pipText = monthlyPipLine(allEvents, [], []);
  var cellMin = isMobile ? 42 : 72;

  return (
    <div style={{ padding: "12px 14px 40px" }}>
      <PipLine text={pipText} />
      {/* Day-of-week headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        gap: 2, marginTop: 10, marginBottom: 4,
      }}>
        {DAYS_SHORT.map(function (d) {
          return (
            <div key={d} style={{
              textAlign: "center", fontFamily: MONO, fontSize: 10,
              color: C.textMuted, fontWeight: 600, padding: "3px 0",
            }}>
              {d}
            </div>
          );
        })}
      </div>
      {/* Month grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
      }}>
        {grid.map(function (date) {
          var inMonth = date.getMonth() === month;
          var isToday = isSameDay(date, today);
          var key     = toISO(date);
          var dayEvts = byDay[key] || [];
          var dots    = getDots(dayEvts);
          var extra   = dayEvts.length > 3 ? dayEvts.length - 3 : 0;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={function () { onSetDailyDate(date); }}
              onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSetDailyDate(date); } }}
              style={{
                minHeight: cellMin,
                background: isToday ? C.accentFaint : C.surface,
                border: "1px solid " + (isToday ? C.accentSubtle : C.rule),
                borderRadius: 5,
                padding: "4px 5px 4px",
                cursor: "pointer",
                opacity: inMonth ? 1 : 0.28,
                display: "flex", flexDirection: "column",
              }}
              onMouseEnter={function (e) { if (!isToday) e.currentTarget.style.background = C.surface2; }}
              onMouseLeave={function (e) { e.currentTarget.style.background = isToday ? C.accentFaint : C.surface; }}
            >
              {/* Day number */}
              {isToday ? (
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 20, height: 20, borderRadius: "50%",
                  background: C.accent, color: "#000",
                  fontSize: 10, fontWeight: 700, fontFamily: MONO,
                  fontVariantNumeric: "tabular-nums",
                  flexShrink: 0,
                }}>
                  {date.getDate()}
                </div>
              ) : (
                <div style={{
                  fontSize: 10, color: C.textSoft,
                  fontFamily: MONO, fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.5,
                }}>
                  {date.getDate()}
                </div>
              )}
              {/* Dots row */}
              {dayEvts.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 2,
                  flexWrap: "wrap", marginTop: "auto", paddingTop: 2,
                }}>
                  {dots.map(function (color, i) {
                    return (
                      <div key={i} style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: color,
                      }} />
                    );
                  })}
                  {extra > 0 && (
                    <div style={{
                      fontFamily: MONO, fontSize: 8, color: C.textMuted,
                      lineHeight: 1,
                    }}>
                      +{extra}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main CalendarView ────────────────────────────────────────────────────────

export function CalendarView({
  meetings, cadences, items, projects, quickTasks, accounts,
  onOpenAccount, onOpenCadenceHub, onOpenConversation, onAddItem,
}) {
  var isDesktop = useBreakpoint();
  var isMobile  = !isDesktop;

  // ── Persisted state ────────────────────────────────────────────────────────
  var defaultView = isMobile ? "daily" : "weekly";
  var [viewMode, setViewModeState] = useState(function () {
    try { return localStorage.getItem("folio_cal_view") || defaultView; } catch (e) { return defaultView; }
  });
  var [filter, setFilterState] = useState(function () {
    try { return localStorage.getItem("folio_cal_filter") || "all"; } catch (e) { return "all"; }
  });

  function setViewMode(v) {
    setViewModeState(v);
    try { localStorage.setItem("folio_cal_view", v); } catch (e) { void e; }
  }

  function setFilter(f) {
    setFilterState(f);
    try { localStorage.setItem("folio_cal_filter", f); } catch (e) { void e; }
  }

  // ── Focused date ───────────────────────────────────────────────────────────
  var [focusedDate, setFocusedDate] = useState(function () { return startOfDay(new Date()); });

  // ── Navigation ────────────────────────────────────────────────────────────
  function handlePrev() {
    if (viewMode === "daily") setFocusedDate(function (d) { return addDays(d, -1); });
    else if (viewMode === "weekly") setFocusedDate(function (d) { return addDays(d, -7); });
    else setFocusedDate(function (d) {
      var nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd;
    });
  }

  function handleNext() {
    if (viewMode === "daily") setFocusedDate(function (d) { return addDays(d, 1); });
    else if (viewMode === "weekly") setFocusedDate(function (d) { return addDays(d, 7); });
    else setFocusedDate(function (d) {
      var nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd;
    });
  }

  function handleToday() {
    setFocusedDate(startOfDay(new Date()));
  }

  // ── Drill to daily ─────────────────────────────────────────────────────────
  function handleSetDailyDate(date) {
    setFocusedDate(startOfDay(date));
    setViewMode("daily");
  }

  // ── Date range for event aggregation ──────────────────────────────────────
  var { rangeStart, rangeEnd } = useMemo(function () {
    if (viewMode === "daily") {
      return { rangeStart: focusedDate, rangeEnd: focusedDate };
    } else if (viewMode === "weekly") {
      var ws = startOfWeekSun(focusedDate);
      return { rangeStart: ws, rangeEnd: addDays(ws, 6) };
    } else {
      // Monthly — include the whole grid (42 cells from getCalendarGrid)
      var year  = focusedDate.getFullYear();
      var month = focusedDate.getMonth();
      var grid  = getCalendarGrid(year, month);
      return { rangeStart: grid[0], rangeEnd: grid[grid.length - 1] };
    }
  }, [viewMode, focusedDate]);

  var allEvents = useMemo(function () {
    return buildEvents({
      meetings, cadences, items, projects, quickTasks, accounts,
      filter, startDate: rangeStart, endDate: rangeEnd,
    });
  }, [meetings, cadences, items, projects, quickTasks, accounts, filter, rangeStart, rangeEnd]);

  // Events for focused day in daily mode
  var dailyEvents = useMemo(function () {
    if (viewMode !== "daily") return allEvents;
    return allEvents.filter(function (e) { return isSameDay(e.date, focusedDate); });
  }, [allEvents, viewMode, focusedDate]);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%",
      background: C.bg,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    }}>
      <CalendarHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        focusedDate={focusedDate}
        onPrev={handlePrev}
        onToday={handleToday}
        onNext={handleNext}
        filter={filter}
        setFilter={setFilter}
        isMobile={isMobile}
      />

      {viewMode === "daily" && (
        <DailyView
          focusedDate={focusedDate}
          events={dailyEvents}
          onOpenAccount={onOpenAccount}
          onOpenCadenceHub={onOpenCadenceHub}
          onOpenConversation={onOpenConversation}
          onAddItem={onAddItem}
        />
      )}

      {viewMode === "weekly" && (
        <WeeklyView
          focusedDate={focusedDate}
          allEvents={allEvents}
          onSetDailyDate={handleSetDailyDate}
          onOpenAccount={onOpenAccount}
          onOpenCadenceHub={onOpenCadenceHub}
          onOpenConversation={onOpenConversation}
          isMobile={isMobile}
        />
      )}

      {viewMode === "monthly" && (
        <MonthlyView
          focusedDate={focusedDate}
          allEvents={allEvents}
          onSetDailyDate={handleSetDailyDate}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
