import { C } from "../../lib/colors";
import { Mark } from "../../components/Mark";
import { EmptyState } from "../../components/EmptyState";
import { showToast } from "../../components/Toast";
import { ownerLabel } from "../../lib/ownerLabel";

var SERIF = "'Fraunces', Georgia, serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

// "Stalled" threshold — matches the GaugeView ⏳ red chip so the whole app agrees
// on when a waiting-on has gone cold.
var STALLED_DAYS = 10;

function daysSince(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function chaseNote(who, what) {
  var first = (who || "").split(" ")[0];
  return "Hi " + first + " — checking in on \"" + what + "\". Where do things stand? " +
    "Anything you need from me to move it? Thanks!";
}

// "Who has the ball" — everything the user is WAITING ON someone else for,
// across all accounts + projects, aged so the longest-stuck floats to the top.
// The complement of My Commitments (what the user owes). Built from the
// waiting_on / waiting_on_since layer already on folio_tasks + gauge_projects.
export function WaitingOnView({ items, projects, accounts, onOpenAccount, onClearWaiting }) {
  var accountById = {};
  (accounts || []).forEach(function (a) { accountById[a.id] = a; });

  var rows = [];
  (items || []).forEach(function (i) {
    if (!i.waiting_on || i.done || i.status === "complete") return;
    rows.push({
      kind: "task", id: i.id, who: i.waiting_on,
      what: i.text || i.title || "—",
      account_id: i.account_id, since: i.waiting_on_since || null,
    });
  });
  (projects || []).forEach(function (p) {
    if (!p.waiting_on || p.status === "complete") return;
    rows.push({
      kind: "project", id: p.id, who: p.waiting_on,
      what: p.title || "untitled project",
      account_id: p.account_id, since: p.waiting_on_since || null,
    });
  });

  rows.forEach(function (r) { r.days = daysSince(r.since); });
  // Longest-waiting first; unknown-since (no days) sorts last.
  rows.sort(function (a, b) {
    if (a.days == null && b.days == null) return 0;
    if (a.days == null) return 1;
    if (b.days == null) return -1;
    return b.days - a.days;
  });

  var stalled = rows.filter(function (r) { return r.days != null && r.days >= STALLED_DAYS; });
  var waiting = rows.filter(function (r) { return !(r.days != null && r.days >= STALLED_DAYS); });

  function handleChase(r) {
    var msg = chaseNote(ownerLabel(r.who), r.what);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg)
        .then(function () { showToast("Chase note for " + ownerLabel(r.who) + " copied — paste into email or Teams"); })
        .catch(function () { showToast("Couldn't copy to clipboard", "error"); });
    } else {
      showToast("Couldn't copy to clipboard", "error");
    }
  }

  function handleResponded(r) {
    if (onClearWaiting) onClearWaiting(r.kind, r.id);
    showToast("Cleared — " + ownerLabel(r.who) + " is off the hook");
  }

  function renderRow(r) {
    var acct = accountById[r.account_id];
    var isStalled = r.days != null && r.days >= STALLED_DAYS;
    var ageColor = isStalled ? C.red : (r.days != null && r.days >= 5 ? C.yellow : C.textMuted);
    var ageLabel = r.days == null ? "no date" : (r.days === 0 ? "today" : r.days + "d");
    return (
      <div
        key={r.kind + ":" + r.id}
        style={{
          background: C.bgCard, border: "1px solid " + (isStalled ? C.red : C.border),
          borderRadius: 8, padding: "11px 14px",
          display: "flex", gap: 12, alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>{r.what}</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>
              waiting on {ownerLabel(r.who)}
            </span>
            {acct && (
              <button
                onClick={function () { onOpenAccount && onOpenAccount(acct.id); }}
                style={{
                  background: C.accentFaint, border: "1px solid " + C.accentLine,
                  borderRadius: 12, padding: "2px 8px", fontSize: 11, color: C.accent,
                  fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
                  fontWeight: 500, lineHeight: 1.4,
                }}
              >
                {acct.name}
              </button>
            )}
            <span style={{ fontSize: 11, color: ageColor, fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>
              {isStalled ? "stalled · " : "waiting · "}{ageLabel}
            </span>
            {r.kind === "project" && (
              <span style={{ fontSize: 10, color: C.textFaint, fontFamily: MONO, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                project
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <button
            onClick={function () { handleChase(r); }}
            style={{
              background: C.accentFaint, border: "1px solid " + C.accentLine, borderRadius: 6,
              padding: "4px 10px", fontSize: 11, color: C.accent, cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 600, whiteSpace: "nowrap",
            }}
          >
            Chase
          </button>
          <button
            onClick={function () { handleResponded(r); }}
            title="They responded — clear it"
            style={{
              background: "transparent", border: "1px solid " + C.border, borderRadius: 6,
              padding: "4px 10px", fontSize: 11, color: C.textMuted, cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif", whiteSpace: "nowrap",
            }}
          >
            ✓ Responded
          </button>
        </div>
      </div>
    );
  }

  function renderSection(label, color, sectionRows) {
    if (sectionRows.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: color, textTransform: "uppercase",
          letterSpacing: "0.09em", fontFamily: MONO, marginBottom: 8,
        }}>
          {label} &middot; {sectionRows.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {sectionRows.map(renderRow)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Mark tab="commitments" size={52} />
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 400, color: C.text, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
            Who Has the Ball
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: C.textFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 3 }}>
            {rows.length} thing{rows.length === 1 ? "" : "s"} you're waiting on across all accounts
          </div>
        </div>
      </div>

      {rows.length === 0 && (
        <EmptyState
          icon="✦"
          title="Nobody owes you anything right now."
          subtitle="Mark a task or project as 'waiting on' someone (from its detail panel) and it shows here, aged, so a dropped ball never goes quiet."
        />
      )}

      {renderSection("Stalled · " + STALLED_DAYS + "+ days", C.red, stalled)}
      {renderSection("Waiting", C.accent, waiting)}
    </div>
  );
}
