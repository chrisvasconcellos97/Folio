// PipMemoryPanel — per-account transparency view of everything Pip has learned.
// Read-only audit surface: lessons learned (compressed from correction log),
// recent corrections grouped by type, pip_tone chip, and correction count.
//
// Data sources (no schema changes — reads existing tables):
//   pip_account_state   → lessons_learned, updated_at
//   pip_correction_log  → last 15 corrections for this account
//   account.pip_tone    → last tone Pip assigned

import { useState, useEffect } from "react";
import { Modal } from "../../components/Modal";
import { FL } from "../../components/FieldLabel";
import { C } from "../../lib/colors";
import { fmtMedium } from "../../lib/dateUtils";
import { supabase } from "../../lib/supabase";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var INTER = "'Inter', system-ui, sans-serif";

var TYPE_LABELS = {
  summary_edit:          "Summary edits",
  rejected_row:          "Rejected suggestions",
  missed_item:           "Items Pip missed",
  item_text_edit:        "Text corrections",
  task_text_edit:        "Text corrections",
  routed_account_changed: "Account routing fixes",
};

var TYPE_COLORS = {
  summary_edit:          C.blue,
  rejected_row:          C.yellow,
  missed_item:           C.accent,
  item_text_edit:        C.textSoft,
  task_text_edit:        C.textSoft,
  routed_account_changed: C.purple,
};

function typeBadge(correctionType) {
  var label = TYPE_LABELS[correctionType] || correctionType;
  var color = TYPE_COLORS[correctionType] || C.textMuted;
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: color,
        background: "transparent",
        border: "1px solid " + color,
        borderRadius: 4,
        padding: "1px 5px",
        flexShrink: 0,
        opacity: 0.85,
      }}
    >
      {label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return fmtMedium(iso);
  } catch(e) {
    return "";
  }
}

// Extract a display string from a correction's JSONB value. The columns store
// objects ({text:...}, {kind, original, ...}) or occasionally a bare string —
// reading them directly rendered "[object Object]" or crashed on .length.
function valueToText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return v.text || v.title || v.corrected || v.original || v.proposed || v.reason || "";
  }
  return String(v);
}

function correctionText(row) {
  // Prefer the corrected value, fall back to the original.
  var text = valueToText(row.corrected_value) || valueToText(row.original_value);
  if (!text || typeof text !== "string") return null;
  if (text.length > 120) return text.slice(0, 117) + "…";
  return text;
}

// Group corrections by their canonical type label (merging item_text_edit +
// task_text_edit under "Text corrections").
function groupCorrections(corrections) {
  var groups = {};
  corrections.forEach(function (c) {
    var label = TYPE_LABELS[c.correction_type] || c.correction_type;
    if (!groups[label]) groups[label] = { label: label, color: TYPE_COLORS[c.correction_type] || C.textMuted, rows: [] };
    groups[label].rows.push(c);
  });
  // Return sorted: most rows first.
  return Object.values(groups).sort(function (a, b) { return b.rows.length - a.rows.length; });
}

export function PipMemoryPanel({ account, userId, onClose, onOpenSettings }) {
  var [lessonRow, setLessonRow]       = useState(null);
  var [corrections, setCorrections]   = useState([]);
  var [totalCount, setTotalCount]     = useState(null);
  var [loading, setLoading]           = useState(true);
  var [error, setError]               = useState(null);

  useEffect(function () {
    if (!userId || !account || !account.id) {
      setLoading(false);
      return;
    }

    var cancelled = false;

    // Three parallel reads: pip_account_state, last 15 corrections, total count.
    var statePromise = supabase
      .from("pip_account_state")
      .select("lessons_learned, updated_at")
      .eq("account_id", account.id)
      .eq("user_id", userId)
      .maybeSingle()
      .then(function (r) { return r.error ? null : (r.data || null); })
      .catch(function () { return null; });

    var correctionsPromise = supabase
      .from("pip_correction_log")
      .select("*")
      .eq("account_id", account.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15)
      .then(function (r) { return r.error ? [] : (r.data || []); })
      .catch(function () { return []; });

    var countPromise = supabase
      .from("pip_correction_log")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id)
      .eq("user_id", userId)
      .then(function (r) { return r.error ? null : (r.count || 0); })
      .catch(function () { return null; });

    Promise.all([statePromise, correctionsPromise, countPromise]).then(function (results) {
      if (cancelled) return;
      setLessonRow(results[0]);
      setCorrections(results[1]);
      setTotalCount(results[2]);
      setLoading(false);
    }).catch(function (e) {
      if (cancelled) return;
      setError((e && e.message) || "Couldn't load Pip memory.");
      setLoading(false);
    });

    return function () { cancelled = true; };
  }, [userId, account && account.id]);

  var groups = groupCorrections(corrections);

  return (
    <Modal
      title={"Pip's Memory · " + (account ? account.name : "")}
      onClose={onClose}
      width={480}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {loading && (
          <div style={{ color: C.textMuted, fontSize: 13, padding: "12px 0", textAlign: "center" }}>
            Loading Pip's memory…
          </div>
        )}

        {error && !loading && (
          <div
            role="alert"
            style={{ background: C.redFaint, border: "1px solid " + C.redLine, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red }}
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Pip tone chip ─────────────────────────────────── */}
            {account && account.pip_tone && (
              <div>
                <FL>Last tone</FL>
                <span
                  style={{
                    display: "inline-block",
                    fontFamily: MONO,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: C.accent,
                    border: "1px solid " + C.accentBorder,
                    borderRadius: 6,
                    padding: "3px 10px",
                    background: C.accentFaint,
                  }}
                >
                  {account.pip_tone}
                </span>
              </div>
            )}

            {/* ── Lessons learned ───────────────────────────────── */}
            <div>
              <FL>What Pip has learned</FL>
              {lessonRow && lessonRow.lessons_learned ? (
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textSoft,
                      lineHeight: 1.65,
                      padding: "10px 12px",
                      background: "var(--c-input-fill)",
                      border: "1px solid " + C.ruleSoft,
                      borderRadius: 8,
                    }}
                  >
                    {lessonRow.lessons_learned}
                  </div>
                  {lessonRow.updated_at && (
                    <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 9.5, color: C.textFaint, letterSpacing: "0.04em" }}>
                      Updated {fmtDate(lessonRow.updated_at)}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>
                  Pip hasn't built up enough history on this account yet.
                </div>
              )}
            </div>

            {/* ── Correction count ──────────────────────────────── */}
            {totalCount !== null && (
              <div
                style={{
                  fontSize: 11,
                  color: C.textMuted,
                  fontFamily: MONO,
                  letterSpacing: "0.04em",
                  borderTop: "1px solid " + C.ruleSoft,
                  paddingTop: 12,
                }}
              >
                <span style={{ color: C.textSoft, fontWeight: 700 }}>{totalCount}</span>
                {" correction" + (totalCount === 1 ? "" : "s") + " logged total — Pip uses these to improve future suggestions."}
              </div>
            )}

            {/* ── Recent corrections grouped by type ────────────── */}
            <div>
              <FL>Recent corrections</FL>
              {corrections.length === 0 ? (
                <div style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>
                  No corrections logged yet — Pip is still learning.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 320, overflowY: "auto" }}>
                  {groups.map(function (group) {
                    return (
                      <div key={group.label}>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 9.5,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.07em",
                            color: group.color,
                            marginBottom: 6,
                            opacity: 0.85,
                          }}
                        >
                          {group.label} ({group.rows.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {group.rows.map(function (row) {
                            var text = correctionText(row);
                            return (
                              <div
                                key={row.id}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: 8,
                                  padding: "7px 10px",
                                  background: "var(--c-input-fill)",
                                  border: "1px solid " + C.ruleSoft,
                                  borderRadius: 7,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  {text && (
                                    <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5, marginBottom: 2, wordBreak: "break-word" }}>
                                      {text}
                                    </div>
                                  )}
                                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.textFaint, letterSpacing: "0.04em" }}>
                                    {fmtDate(row.created_at)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Footer note ──────────────────────────────────────── */}
            <div
              style={{
                fontSize: 11,
                color: C.textFaint,
                fontFamily: MONO,
                letterSpacing: "0.03em",
                borderTop: "1px solid " + C.ruleSoft,
                paddingTop: 10,
                lineHeight: 1.55,
              }}
            >
              Pip reads the last 10 corrections before each meeting summary.
            </div>

            {onOpenSettings && (
              <button
                onClick={function () { onClose && onClose(); onOpenSettings(); }}
                style={{
                  marginTop: 10, background: "none", border: "none", padding: 0,
                  color: C.accent, fontFamily: INTER, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", textAlign: "left",
                }}
              >
                Pip also knows some things about you →
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
