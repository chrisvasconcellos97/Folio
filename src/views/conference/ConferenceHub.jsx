import { useState } from "react";
import { C } from "../../lib/colors";
import { Mark } from "../../components/Mark";
import { EmptyState } from "../../components/EmptyState";
import { fmtShort } from "../../lib/dateUtils";
import {
  daysUntil,
  conferenceStatus,
  buildLooseEndsSweep,
  presentationProgress,
} from "../../lib/conferencePrep";
import { ConferenceModal } from "./ConferenceModal";

var SERIF = "'Fraunces', Georgia, serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

function Row({ row, onOpenAccount }) {
  return (
    <div
      onClick={row.account_id ? function () { onOpenAccount(row.account_id); } : undefined}
      role={row.account_id ? "button" : undefined}
      tabIndex={row.account_id ? 0 : undefined}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "9px 11px", borderRadius: 8, border: "1px solid " + C.rule, background: C.surface,
        cursor: row.account_id ? "pointer" : "default",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.4 }}>
          {row.title}
          {row.is_commitment && <span style={{ color: C.accent }}> · ✦ commitment</span>}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, fontFamily: MONO }}>
          {row.account_name ? row.account_name + " · " : ""}
          {row.kind === "project" ? "project" : "task"}
          {row.due_date ? " · due " + fmtShort(row.due_date) : ""}
          {row.waiting_on ? " · waiting on " + row.waiting_on : ""}
        </div>
      </div>
    </div>
  );
}

// Conference Prep (item 56) — the detail view. Countdown + the "close loose
// ends before you fly out" sweep + presentation-prep progress. Deliberately
// NOT an in-event schedule/notes tool — that's Lanyard's lane.
export function ConferenceHub({ conference, accounts, items, projects, onOpenAccount, onUpdate, onDelete, onBack }) {
  var [editing, setEditing] = useState(false);

  if (!conference) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <EmptyState icon="✦" title="Conference not found" subtitle="It may have been removed." />
      </div>
    );
  }

  var days = daysUntil(conference);
  var status = conferenceStatus(conference);
  var sweep = buildLooseEndsSweep({ conference: conference, items: items, projects: projects, accounts: accounts });
  var prepProject = conference.gauge_project_id
    ? (projects || []).find(function (p) { return p.id === conference.gauge_project_id; })
    : null;
  var progress = presentationProgress(prepProject);

  var countdownLabel = status === "past" ? "Already happened"
    : status === "active" ? "Happening now"
    : days === 0 ? "Today"
    : days === 1 ? "Tomorrow"
    : days + " days to go";

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Mark tab="cadence" size={52} />
          <div>
            <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              {conference.name}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 3 }}>
              {countdownLabel} · {fmtShort(conference.start_date)}–{fmtShort(conference.end_date)}
              {conference.location ? " · " + conference.location : ""}
            </div>
          </div>
        </div>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: INTER }}>
            ← Back
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={function () { setEditing(true); }}
          style={{ background: "none", border: "1px solid " + C.accentLine, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: C.accent, fontFamily: INTER, cursor: "pointer" }}
        >
          Edit
        </button>
        <button
          onClick={function () { if (onDelete) onDelete(conference.id); }}
          style={{ background: "none", border: "1px solid " + C.rule, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: C.textMuted, fontFamily: INTER, cursor: "pointer" }}
        >
          Remove
        </button>
      </div>

      {editing && (
        <ConferenceModal
          conference={conference}
          accounts={accounts}
          onSave={function (payload) { return onUpdate(conference.id, payload); }}
          onClose={function () { setEditing(false); }}
        />
      )}

      {prepProject && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            Presentation prep
          </div>
          <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid " + C.rule, background: C.surface }}>
            <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>{prepProject.title}</div>
            {progress.total > 0 && (
              <div style={{ height: 6, borderRadius: 999, background: C.accentFaint, overflow: "hidden" }}>
                <div style={{ height: "100%", width: progress.pct + "%", background: "linear-gradient(to right, #3b82f6, " + C.accent + ")" }} />
              </div>
            )}
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, fontFamily: MONO }}>
              {progress.done} of {progress.total} done{progress.pct != null ? " · " + progress.pct + "%" : ""}
            </div>
          </div>
        </div>
      )}

      {sweep.conferenceRows.length === 0 && sweep.portfolioRows.length === 0 ? (
        <EmptyState
          icon="✦"
          title="Nothing hanging that needs your attention."
          subtitle="Overdue commitments and stalled projects will show up here as they come up before you leave."
        />
      ) : (
        <>
          {sweep.conferenceRows.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                Accounts you'll see there
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {sweep.conferenceRows.map(function (r) { return <Row key={r.kind + r.id} row={r} onOpenAccount={onOpenAccount} />; })}
              </div>
            </div>
          )}
          {sweep.portfolioRows.length > 0 && (
            <div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                Rest of the portfolio
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {sweep.portfolioRows.map(function (r) { return <Row key={r.kind + r.id} row={r} onOpenAccount={onOpenAccount} />; })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
