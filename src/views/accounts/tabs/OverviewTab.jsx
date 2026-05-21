import { C } from "../../../lib/colors";
import { PipMark } from "../../../components/PipMark";
import { AmberBtn, SecBtn } from "../../../components/Buttons";
import { Card } from "../../../components/Card";
import { FL } from "../../../components/FieldLabel";

var STATUS_COLORS = { green: C.green, yellow: C.yellow, red: C.red };

function pipSummary(account, openCount) {
  if (account.status === "red") {
    return (
      account.name +
      " needs attention. " +
      openCount +
      " open item" +
      (openCount !== 1 ? "s" : "") +
      " — the oldest may be overdue. I'd prioritize this one before your next call."
    );
  }
  if (account.status === "yellow") {
    return (
      account.name +
      " is moving in the right direction, but watch the open items. " +
      openCount +
      " still pending."
    );
  }
  return (
    account.name + " is in great shape. Relationship is healthy and the pipeline looks solid."
  );
}

export function OverviewTab({ account, openItems, onLogMeeting, onAddItem }) {
  var openCount = openItems.filter(function (i) { return !i.done; }).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Pip relationship card */}
      <div
        style={{
          background: C.accentGlow,
          border: "1px solid rgba(200,136,58,0.2)",
          borderRadius: 12,
          padding: "13px 15px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <PipMark size={8} color={C.accent} glow pulse />
          <div
            style={{
              fontSize: 9,
              color: C.accent,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Pip
          </div>
        </div>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>
          {pipSummary(account, openCount)}
        </div>
      </div>

      {/* Objective */}
      {account.objective && (
        <Card>
          <FL>Meeting Objective</FL>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            {account.objective}
          </div>
        </Card>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Card>
          <FL>Last Meeting</FL>
          <div style={{ fontSize: 13, color: C.text }}>
            {account.last_meeting
              ? new Date(account.last_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "—"}
          </div>
        </Card>
        <Card>
          <FL>Next Meeting</FL>
          <div style={{ fontSize: 13, color: account.next_meeting ? C.accent : C.textMuted }}>
            {account.next_meeting
              ? new Date(account.next_meeting).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "Not scheduled"}
          </div>
        </Card>
        <Card>
          <FL>Open Items</FL>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: openCount > 0 ? C.yellow : C.green,
            }}
          >
            {openCount}
          </div>
        </Card>
        <Card>
          <FL>Revenue YTD</FL>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>
            {account.revenue || "—"}
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <AmberBtn style={{ flex: 1 }} onClick={onLogMeeting}>
          Log Meeting
        </AmberBtn>
        <SecBtn style={{ flex: 1 }} onClick={onAddItem}>
          Add Item
        </SecBtn>
      </div>
    </div>
  );
}
