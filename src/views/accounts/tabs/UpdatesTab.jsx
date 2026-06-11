import { useState } from "react";
import { C } from "../../../lib/colors";
import { fmtMedium } from "../../../lib/dateUtils";
import { Card } from "../../../components/Card";
import { AmberBtn, SecBtn, DangerBtn } from "../../../components/Buttons";
import { Mark } from "../../../components/Mark";
import { showToast } from "../../../components/Toast";
import { AddUpdateModal } from "../AddUpdateModal";
import {
  UPDATE_TYPE_LABELS, UPDATE_TYPE_COLORS,
  IMPACT_LABELS,
} from "../../../lib/accountUpdateTypes";

var UT_SERIF = "'Fraunces', Georgia, serif";
var UT_MONO  = "'JetBrains Mono', ui-monospace, monospace";

function fmtMonth(d) {
  // eslint-ok: one-off locale format (month + year section header)
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function fmtDayShort(iso) {
  if (!iso) return "—";
  return fmtMedium(iso);
}

// Group updates by Year-Month for the section headers, descending.
function groupByMonth(updates) {
  var buckets = {};
  var order   = [];
  updates.forEach(function (u) {
    if (!u.update_date) return;
    var d   = new Date(u.update_date + "T12:00:00");
    var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!buckets[key]) {
      buckets[key] = { label: fmtMonth(d), rows: [] };
      order.push(key);
    }
    buckets[key].rows.push(u);
  });
  return order.map(function (k) { return buckets[k]; });
}

function TypePill({ type }) {
  var color = UPDATE_TYPE_COLORS[type] || C.textMuted;
  var label = UPDATE_TYPE_LABELS[type] || type;
  return (
    <span
      style={{
        fontFamily: UT_MONO,
        fontSize: 9,
        color: color,
        fontWeight: 600,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 10,
        textTransform: "uppercase",
        border: "1px solid " + color,
        opacity: 0.95,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function UpdatesTab({ account, updates, orgMembers, contacts, addUpdate, updateUpdate, deleteUpdate }) {
  var [showModal, setShowModal]               = useState(false);
  var [editingUpdate, setEditingUpdate]       = useState(null);
  var [confirmDeleteId, setConfirmDeleteId]   = useState(null);

  var groups = groupByMonth(updates || []);

  function handleDelete(id) {
    deleteUpdate(id)
      .then(function () { showToast("Update removed", "warning"); })
      .catch(function (err) {
        showToast(err.message || "Couldn't delete — check your connection", "error");
      });
    setConfirmDeleteId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Section header with mark + CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Mark tab="updates" size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: UT_SERIF, fontSize: 20, color: C.text, letterSpacing: "-0.01em" }}>
            Updates
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            Notable changes worth tracking on {account.name}.
          </div>
        </div>
        <AmberBtn onClick={function () { setShowModal(true); }}>
          + Log update
        </AmberBtn>
      </div>

      {(!updates || updates.length === 0) && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
          <div style={{ marginBottom: 12 }}>
            No updates logged yet. Log the next change — catalog push, pricing tweak, integration — so you have a paper trail.
          </div>
          <AmberBtn onClick={function () { setShowModal(true); }} style={{ fontSize: 12 }}>
            + Log first update
          </AmberBtn>
        </div>
      )}

      {groups.map(function (group, gi) {
        return (
          <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{
              fontFamily: UT_MONO, fontSize: 10, color: C.textMuted,
              fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
              marginTop: gi === 0 ? 0 : 6,
            }}>
              {group.label}
            </div>

            {group.rows.map(function (u, i) {
              var confirmDel = confirmDeleteId === u.id;
              return (
                <Card key={u.id} className="list-item" style={{ animationDelay: i * 0.04 + "s" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{
                      fontFamily: UT_MONO, fontSize: 11, color: C.textMuted,
                      fontVariantNumeric: "tabular-nums",
                      minWidth: 80, paddingTop: 3, flexShrink: 0,
                    }}>
                      {fmtDayShort(u.update_date)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <div style={{ fontFamily: UT_SERIF, fontSize: 15.5, color: C.text, letterSpacing: "-0.005em", lineHeight: 1.25 }}>
                          {u.title}
                        </div>
                        <TypePill type={u.update_type} />
                        {u.observed_impact && (
                          <span style={{
                            fontSize: 10, fontFamily: UT_MONO, color: C.textMuted,
                            letterSpacing: "0.05em", textTransform: "uppercase",
                          }}>
                            Impact: {IMPACT_LABELS[u.observed_impact] || u.observed_impact}
                          </span>
                        )}
                      </div>

                      {u.owner && (
                        <div style={{ fontFamily: UT_MONO, fontSize: 10.5, color: C.textMuted, marginBottom: 6, letterSpacing: "0.04em" }}>
                          {u.owner}
                        </div>
                      )}

                      {u.description && (
                        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                          {u.description}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {!confirmDel && updateUpdate && (
                        <SecBtn
                          onClick={function () { setEditingUpdate(u); }}
                          style={{ fontSize: 10, padding: "4px 10px" }}
                        >
                          Edit
                        </SecBtn>
                      )}
                      {!confirmDel && deleteUpdate && (
                        <DangerBtn
                          onClick={function () { setConfirmDeleteId(u.id); }}
                          style={{ fontSize: 10, padding: "4px 10px" }}
                        >
                          Remove
                        </DangerBtn>
                      )}
                      {confirmDel && deleteUpdate && (
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: C.red }}>Sure?</span>
                          <DangerBtn
                            onClick={function () { handleDelete(u.id); }}
                            style={{ fontSize: 10, padding: "4px 10px" }}
                          >
                            Yes
                          </DangerBtn>
                          <SecBtn
                            onClick={function () { setConfirmDeleteId(null); }}
                            style={{ fontSize: 10, padding: "4px 10px" }}
                          >
                            No
                          </SecBtn>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })}

      {showModal && (
        <AddUpdateModal
          orgMembers={orgMembers}
          contacts={contacts || []}
          onSave={function (data) {
            return addUpdate(data).then(function (u) {
              showToast("Update logged");
              return u;
            });
          }}
          onClose={function () { setShowModal(false); }}
        />
      )}

      {editingUpdate && (
        <AddUpdateModal
          orgMembers={orgMembers}
          contacts={contacts || []}
          existing={editingUpdate}
          onSave={function (data) {
            return updateUpdate(editingUpdate.id, data).then(function (u) {
              showToast("Update saved");
              return u;
            });
          }}
          onClose={function () { setEditingUpdate(null); }}
        />
      )}
    </div>
  );
}
