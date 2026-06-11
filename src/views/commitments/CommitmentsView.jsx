import { C } from "../../lib/colors";
import { Mark } from "../../components/Mark";
import { ownerLabel } from "../../lib/ownerLabel";
import { fmtShort } from "../../lib/dateUtils";
import { EmptyState } from "../../components/EmptyState";

var SERIF = "'Fraunces', Georgia, serif";
var MONO  = "'JetBrains Mono', ui-monospace, monospace";

function daysSinceCreated(createdAt) {
  if (!createdAt) return null;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function formatDueDate(dueDate) {
  if (!dueDate) return null;
  return fmtShort(dueDate);
}

export function CommitmentsView({ items, accounts, onOpenAccount, onMarkDone }) {
  var today = new Date().toISOString().slice(0, 10);
  var sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // Build account lookup map
  var accountById = {};
  (accounts || []).forEach(function (a) { accountById[a.id] = a; });

  // Filter to open commitments only
  var commitments = (items || []).filter(function (i) {
    return i.is_commitment && !i.done;
  });

  // Sort: overdue first, then by due_date asc, then no due date last
  commitments = commitments.slice().sort(function (a, b) {
    var aOverdue = a.due_date && a.due_date < today;
    var bOverdue = b.due_date && b.due_date < today;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (!a.due_date && b.due_date) return 1;
    if (a.due_date && !b.due_date) return -1;
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    return 0;
  });

  var overdue  = commitments.filter(function (i) { return i.due_date && i.due_date < today; });
  var dueSoon  = commitments.filter(function (i) { return i.due_date && i.due_date >= today && i.due_date <= sevenDaysOut; });
  var upcoming = commitments.filter(function (i) { return !i.due_date || i.due_date > sevenDaysOut; });

  function renderRow(item) {
    var acct = accountById[item.account_id];
    var isOverdue = item.due_date && item.due_date < today;
    var isSoon    = item.due_date && item.due_date >= today && item.due_date <= sevenDaysOut;
    var dueDateColor = isOverdue ? C.red : isSoon ? C.yellow : C.textMuted;
    var dayOpen = daysSinceCreated(item.created_at);
    var owner = ownerLabel(item.owner || item.assignee_email);

    return (
      <div
        key={item.id}
        style={{
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 8,
          padding: "11px 14px",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        {/* Complete button */}
        <button
          onClick={function () { onMarkDone && onMarkDone(item.id); }}
          title="Mark done"
          aria-label="Mark commitment done"
          style={{
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
            border: "1.5px solid " + C.accentLine,
            background: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        {/* Title row */}
        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.55 }}>
          {item.text || item.title || "—"}
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
          {/* Account chip */}
          {acct && (
            <button
              onClick={function () { onOpenAccount && onOpenAccount(acct); }}
              style={{
                background: C.accentFaint,
                border: "1px solid " + C.accentLine,
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: 11,
                color: C.accent,
                fontFamily: "'Inter', system-ui, sans-serif",
                cursor: "pointer",
                fontWeight: 500,
                lineHeight: 1.4,
              }}
            >
              {acct.name}
            </button>
          )}

          {/* Due date */}
          {item.due_date && (
            <span style={{
              fontSize: 11,
              color: dueDateColor,
              fontVariantNumeric: "tabular-nums",
              fontFamily: MONO,
            }}>
              {isOverdue ? "Overdue · " : "Due "}{formatDueDate(item.due_date)}
            </span>
          )}

          {/* Owner */}
          {owner && (
            <span style={{ fontSize: 11, color: C.textMuted }}>
              {owner}
            </span>
          )}

          {/* Days open */}
          {dayOpen !== null && (
            <span style={{ fontSize: 11, color: C.textFaint, fontVariantNumeric: "tabular-nums", fontFamily: MONO }}>
              {dayOpen}d open
            </span>
          )}
        </div>
        </div>
      </div>
    );
  }

  function renderSection(label, color, sectionItems) {
    if (sectionItems.length === 0) return null;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: color,
          textTransform: "uppercase",
          letterSpacing: "0.09em",
          fontFamily: MONO,
          marginBottom: 8,
        }}>
          {label} &middot; {sectionItems.length}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {sectionItems.map(renderRow)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Mark tab="commitments" size={52} />
        <div>
          <div style={{
            fontFamily: SERIF,
            fontSize: 28,
            fontWeight: 400,
            color: C.text,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
          }}>
            My Commitments
          </div>
          <div style={{
            fontFamily: MONO,
            fontSize: 10,
            color: C.textFaint,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginTop: 3,
          }}>
            {commitments.length} open {commitments.length === 1 ? "commitment" : "commitments"} across all accounts
          </div>
        </div>
      </div>

      {/* Empty state */}
      {commitments.length === 0 && (
        <EmptyState
          icon="✦"
          title="No open commitments. You're clean."
          subtitle="Commitments are flagged by Pip when you promise something in a meeting. They show up here until you mark them done."
        />
      )}

      {/* Sections */}
      {renderSection("Overdue", C.red, overdue)}
      {renderSection("Due soon", C.yellow, dueSoon)}
      {renderSection("Upcoming & open", C.textMuted, upcoming)}
    </div>
  );
}
