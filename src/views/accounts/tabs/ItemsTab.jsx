import { C } from "../../../lib/colors";
import { AmberBtn } from "../../../components/Buttons";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { pickV } from "../../../lib/metricsUtils";

function buildItemsInsight(items, accountId) {
  var seed    = (accountId || "x") + new Date().getDate().toString();
  var open    = items.filter(function (i) { return !i.done; });
  var closed  = items.filter(function (i) { return i.done; });
  var today   = new Date().toISOString().split("T")[0];
  var overdue = open.filter(function (i) { return i.due_date && i.due_date < today; });

  var cutoff         = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
  var recentlyClosed = closed.filter(function (i) { return i.closed_at && i.closed_at.split("T")[0] >= cutoff; });

  if (items.length === 0) {
    return pickV(seed + "i0", [
      "Nothing here yet. Use this tab to track action items and deliverables from your meetings.",
      "No items yet. Add anything that needs following up — it'll make your next call easier.",
    ]);
  }

  if (open.length === 0) {
    return pickV(seed + "i0", [
      "All " + closed.length + " item" + (closed.length !== 1 ? "s" : "") + " closed. Clean slate — well done.",
      "Nothing open." + (recentlyClosed.length > 0 ? " " + recentlyClosed.length + " closed in the last two weeks — good momentum." : " All done here."),
    ]);
  }

  var parts = [];

  // Lead
  if (overdue.length > 0) {
    parts.push(pickV(seed + "il", [
      overdue.length + " item" + (overdue.length !== 1 ? "s are" : " is") + " overdue. Those should be the priority.",
      overdue.length + " overdue item" + (overdue.length !== 1 ? "s" : "") + " — clear those before the next call.",
    ]));
  } else if (open.length >= 5) {
    parts.push(pickV(seed + "il", [
      open.length + " open items. That's a fair bit to manage — watch that nothing slips.",
      open.length + " things still open. Worth a quick review to make sure nothing's been forgotten.",
    ]));
  } else {
    parts.push(pickV(seed + "il", [
      open.length + " open item" + (open.length !== 1 ? "s" : "") + ". Manageable.",
      open.length + " thing" + (open.length !== 1 ? "s" : "") + " still in progress for this account.",
    ]));
  }

  // Secondary — momentum if recent closes
  if (recentlyClosed.length > 0) {
    parts.push(pickV(seed + "is", [
      recentlyClosed.length + " closed in the last two weeks — good progress.",
      "Good momentum: " + recentlyClosed.length + " item" + (recentlyClosed.length !== 1 ? "s" : "") + " wrapped up recently.",
    ]));
  }

  // Closing
  if (overdue.length === 0) {
    parts.push(pickV(seed + "ic", [
      "Nothing overdue — you're ahead of it.",
      "No past-due items. Keep it that way.",
    ]));
  }

  return parts.join(" ");
}

export function ItemsTab({ items, accountId, onClose, onAdd }) {
  var open   = items.filter(function (i) { return !i.done; });
  var closed = items.filter(function (i) { return i.done; });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PipInsightCard text={buildItemsInsight(items, accountId)} />

      {open.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Open
          </div>
          {open.map(function (item) {
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.bgCard, border: "1px solid " + C.border, borderRadius: 10, padding: "11px 13px", marginBottom: 6 }}>
                <div style={{ paddingTop: 2 }}>
                  <div
                    onClick={function () { onClose(item.id); }}
                    style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + C.accentDim, cursor: "pointer", flexShrink: 0, background: "transparent" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{item.text}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                    {item.due_date && (
                      <div style={{ fontSize: 10, color: C.yellow }}>
                        {"Due: " + new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                    {item.owner && (
                      <div style={{ fontSize: 10, color: C.textMuted }}>{"Owner: " + item.owner}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0 8px", color: C.green, fontSize: 13 }}>
          All clear. No open items.
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Closed
          </div>
          {closed.map(function (item) {
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.bgCard, border: "1px solid " + C.border, borderRadius: 10, padding: "11px 13px", marginBottom: 6, opacity: 0.5 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + C.accentDim, background: C.accentDim, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: "#fff" }}>✓</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: C.textMuted, textDecoration: "line-through", lineHeight: 1.4 }}>{item.text}</div>
                  {item.closed_at && (
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>
                      {"Closed: " + new Date(item.closed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AmberBtn style={{ width: "100%", fontSize: 13 }} onClick={onAdd}>
        + Add Open Item
      </AmberBtn>
    </div>
  );
}
