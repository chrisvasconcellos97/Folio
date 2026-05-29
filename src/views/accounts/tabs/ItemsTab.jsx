import { useState } from "react";
import { C, glass } from "../../../lib/colors";

var IT_SERIF = "'Fraunces', Georgia, serif";
var IT_MONO  = "'JetBrains Mono', ui-monospace, monospace";
import { AmberBtn, SecBtn, DangerBtn } from "../../../components/Buttons";
import { PipInsightCard } from "../../../components/PipInsightCard";
import { pickV } from "../../../lib/metricsUtils";
import { getNextOccurrence, getFrequencyLabel, daysUntil, formatDateFull } from "../../../lib/cadenceUtils";
import { showToast } from "../../../components/Toast";
import { AddItemModal } from "../AddItemModal";

function buildItemsInsight(items, taskCadences, accountId) {
  var seed    = (accountId || "x") + new Date().getDate().toString();
  var open    = items.filter(function (i) { return !i.done; });
  var closed  = items.filter(function (i) { return i.done; });
  var today   = new Date().toISOString().split("T")[0];
  var overdue = open.filter(function (i) { return i.due_date && i.due_date < today; });
  var todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);

  var cutoff         = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
  var recentlyClosed = closed.filter(function (i) { return i.closed_at && i.closed_at.split("T")[0] >= cutoff; });

  var dueSoonTask = (taskCadences || []).map(function (c) {
    var next = getNextOccurrence(c, todayDate);
    return next ? Math.round((next - todayDate) / 86400000) : null;
  }).filter(function (d) { return d !== null && d <= 3; }).length;

  if (items.length === 0 && (!taskCadences || taskCadences.length === 0)) {
    return pickV(seed + "i0", [
      "Nothing here yet. Use this tab to track action items and recurring tasks for this account.",
      "No tasks or items yet. Add anything that needs following up — it'll make your next call easier.",
    ]);
  }

  if (open.length === 0 && (!taskCadences || taskCadences.length === 0)) {
    return pickV(seed + "i0", [
      "All " + closed.length + " item" + (closed.length !== 1 ? "s" : "") + " closed. Clean slate.",
      "Nothing open." + (recentlyClosed.length > 0 ? " " + recentlyClosed.length + " closed recently — good momentum." : " All done here."),
    ]);
  }

  var parts = [];

  if (dueSoonTask > 0) {
    parts.push(pickV(seed + "it", [
      dueSoonTask + " recurring task" + (dueSoonTask !== 1 ? "s are" : " is") + " due in the next 3 days.",
      dueSoonTask === 1 ? "One recurring task coming up soon — don't let it slip." : dueSoonTask + " recurring tasks due soon.",
    ]));
  } else if (overdue.length > 0) {
    parts.push(pickV(seed + "il", [
      overdue.length + " item" + (overdue.length !== 1 ? "s are" : " is") + " overdue. Clear those first.",
      overdue.length + " overdue item" + (overdue.length !== 1 ? "s" : "") + " — flag them on your next call.",
    ]));
  } else if (open.length >= 5) {
    parts.push(pickV(seed + "il", [
      open.length + " open items. That's a fair bit — watch that nothing slips.",
      open.length + " things still open. Worth a review before your next call.",
    ]));
  } else if (open.length > 0) {
    parts.push(pickV(seed + "il", [
      open.length + " open item" + (open.length !== 1 ? "s" : "") + ". Manageable.",
      open.length + " thing" + (open.length !== 1 ? "s" : "") + " still in progress for this account.",
    ]));
  }

  if (recentlyClosed.length > 0) {
    parts.push(pickV(seed + "is", [
      recentlyClosed.length + " closed in the last two weeks — good progress.",
      "Good momentum: " + recentlyClosed.length + " item" + (recentlyClosed.length !== 1 ? "s" : "") + " wrapped up recently.",
    ]));
  } else if (overdue.length === 0 && open.length > 0) {
    parts.push(pickV(seed + "ic", [
      "Nothing overdue — you're ahead of it.",
      "No past-due items. Keep it that way.",
    ]));
  }

  return parts.join(" ");
}

var SEVEN_DAYS_MS = 7 * 86400 * 1000;

export function ItemsTab({ items, taskCadences, accountId, userId, onClose, onAdd, onUpdate, onDelete, onGoToCadence, logCorrection }) {
  var [editingItem, setEditingItem] = useState(null);
  // Track in-flight close requests so rapid taps on the same checkbox don't
  // fire closeItem twice (would log two activity entries + race the refetch).
  var [closingIds, setClosingIds] = useState({});
  var [confirmDelete, setConfirmDelete] = useState(null); // item id mid-confirm

  function handleDelete(id) {
    if (!onDelete) return;
    onDelete(id)
      .then(function () { setConfirmDelete(null); showToast("Item deleted"); })
      .catch(function (err) { showToast(err.message || "Couldn't delete — check your connection", "error"); });
  }
  var open   = items.filter(function (i) { return !i.done; });
  var closed = items.filter(function (i) { return i.done; });
  var today  = new Date(); today.setHours(0, 0, 0, 0);

  var tasks = (taskCadences || []).map(function (c) {
    var next = getNextOccurrence(c, today);
    return { cadence: c, next: next, daysOut: next ? Math.round((next - today) / 86400000) : null };
  }).sort(function (a, b) {
    if (a.daysOut === null) return 1;
    if (b.daysOut === null) return -1;
    return a.daysOut - b.daysOut;
  });

  var sectionLabel = {
    fontSize: 10, color: C.textMuted, textTransform: "uppercase",
    letterSpacing: "0.07em", marginBottom: 8,
  };

  function handleClose(id) {
    if (closingIds[id]) return; // already in flight — ignore extra clicks
    setClosingIds(function (prev) { return Object.assign({}, prev, { [id]: true }); });
    onClose(id)
      .then(function () { showToast("Item closed"); })
      .catch(function (err) { showToast(err.message || "Couldn't close — check your connection", "error"); })
      .then(function () {
        setClosingIds(function (prev) { var n = Object.assign({}, prev); delete n[id]; return n; });
      });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PipInsightCard text={buildItemsInsight(items, taskCadences, accountId)} />

      {/* Recurring Tasks */}
      {tasks.length > 0 && (
        <div>
          <div style={sectionLabel}>Recurring Tasks ({tasks.length})</div>
          {tasks.map(function (t) {
            var isUrgent = t.daysOut !== null && t.daysOut <= 3;
            return (
              <div key={t.cadence.id} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                background: C.bgCard,
                border: "1px solid " + C.border,
                borderLeft: "3px solid " + C.yellow,
                borderRadius: 10, padding: "11px 13px", marginBottom: 6,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: IT_SERIF, fontSize: 15.5, color: C.text, fontWeight: 400, lineHeight: 1.2, letterSpacing: "-0.005em" }}>
                      {t.cadence.task_title}
                    </div>
                    {t.cadence.is_global && (
                      <span style={{ fontFamily: IT_MONO, fontSize: 9, color: C.accent, background: C.accentGlow, border: '1px solid ' + C.accentLine, borderRadius: 10, padding: '2px 7px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        All Accounts
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                    {getFrequencyLabel(t.cadence)}
                  </div>
                  {t.next && (
                    <div style={{ fontSize: 11, color: isUrgent ? C.yellow : C.textMuted, marginTop: 4 }}>
                      {"Next: " + daysUntil(t.next) + " · " + formatDateFull(t.next)}
                    </div>
                  )}
                </div>
                {onGoToCadence && (
                  <button onClick={onGoToCadence}
                    style={{ background: "none", border: "1px solid " + C.border, borderRadius: 6, padding: "4px 10px", fontSize: 11, color: C.textMuted, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer", flexShrink: 0 }}>
                    Cadence →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action Items */}
      {open.length > 0 && (
        <div>
          <div style={sectionLabel}>Action Items</div>
          {open.map(function (item) {
            return (
              <div key={item.id} style={Object.assign({}, glass, { display: "flex", alignItems: "flex-start", gap: 10, borderRadius: 10, padding: "11px 13px", marginBottom: 6 })}>
                <div style={{ paddingTop: 2 }}>
                  <button
                    type="button"
                    onClick={function () { handleClose(item.id); }}
                    disabled={!!closingIds[item.id]}
                    aria-label="Mark complete"
                    style={{ padding: 8, margin: -8, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", opacity: closingIds[item.id] ? 0.4 : 1, cursor: closingIds[item.id] ? "wait" : "pointer" }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + C.accentDim, flexShrink: 0, background: "transparent" }} />
                  </button>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: IT_SERIF, fontSize: 15.5, fontWeight: 400, color: C.text, lineHeight: 1.2, letterSpacing: "-0.005em" }}>{item.text}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                    {item.due_date && (
                      <div style={{ fontFamily: IT_MONO, fontSize: 10, color: C.yellow, letterSpacing: "0.04em", fontFeatureSettings: '"tnum"' }}>
                        {"Due: " + new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                    {item.owner && (
                      <div style={{ fontFamily: IT_MONO, fontSize: 10, color: C.textMuted, letterSpacing: "0.04em" }}>{"Owner: " + item.owner}</div>
                    )}
                  </div>
                </div>
                {onUpdate && (
                  <SecBtn
                    onClick={function () { setEditingItem(item); }}
                    style={{ fontSize: 10, padding: "4px 10px", flexShrink: 0 }}
                  >
                    Edit
                  </SecBtn>
                )}
                {onDelete && confirmDelete !== item.id && (
                  <button
                    onClick={function () { setConfirmDelete(item.id); }}
                    aria-label="Delete item"
                    style={{
                      background: "none", border: "none", color: C.textMuted,
                      fontSize: 16, cursor: "pointer", padding: "2px 6px",
                      flexShrink: 0, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
                {onDelete && confirmDelete === item.id && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    <DangerBtn onClick={function () { handleDelete(item.id); }} style={{ fontSize: 10, padding: "3px 8px" }}>Sure?</DangerBtn>
                    <SecBtn onClick={function () { setConfirmDelete(null); }} style={{ fontSize: 10, padding: "3px 8px" }}>No</SecBtn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tasks.length === 0 && open.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
          <div style={{ color: C.green, fontSize: 13, marginBottom: 10 }}>No open items. You're caught up.</div>
          {onAdd && (
            <button
              onClick={onAdd}
              style={{
                background: C.accentGlow, border: "1px solid " + C.accentSubtle,
                borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 600,
                color: C.accent, fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
              }}
            >
              + Add Action Item
            </button>
          )}
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <div style={sectionLabel}>Closed</div>
          {closed.map(function (item) {
            return (
              <div key={item.id} style={Object.assign({}, glass, { display: "flex", alignItems: "flex-start", gap: 10, borderRadius: 10, padding: "11px 13px", marginBottom: 6, opacity: 0.5 })}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid " + C.accentDim, background: C.accentDim, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: "#fff" }}>✓</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: C.textMuted, textDecoration: "line-through", lineHeight: 1.4 }}>{item.text}</div>
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
        + Add Action Item
      </AmberBtn>

      {editingItem && (
        <AddItemModal
          existing={editingItem}
          accountId={accountId}
          userId={userId}
          onSave={function (id, data) {
            return onUpdate(id, data).then(function () {
              showToast("Item updated");
              if (
                logCorrection &&
                editingItem.pip_created_at &&
                data.text !== undefined &&
                (Date.now() - new Date(editingItem.pip_created_at).getTime()) < SEVEN_DAYS_MS &&
                (data.text || "").trim() !== (editingItem.text || "").trim()
              ) {
                logCorrection({
                  correction_type: 'item_text_edit',
                  account_id:      editingItem.account_id,
                  meeting_id:      null,
                  original_value:  { kind: 'item', original: editingItem.text, pip_created_at: editingItem.pip_created_at },
                  corrected_value: { text: data.text },
                  reason:          null,
                });
              }
              setEditingItem(null);
            }).catch(function (err) {
              showToast(err.message || "Couldn't save — check your connection", "error");
            });
          }}
          onClose={function () { setEditingItem(null); }}
        />
      )}
    </div>
  );
}
