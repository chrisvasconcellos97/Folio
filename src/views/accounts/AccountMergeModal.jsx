// AccountMergeModal — search + pick a target account, then confirm. The
// source account is the one currently open; the modal lists every other
// account in the same workspace type so you can't accidentally merge a
// Partner into a Department (the merge function rejects cross-type
// merges too, but better to never offer the option).

import { useState, useMemo } from "react";
import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";
import { InputField } from "../../components/InputField";
import { AmberBtn, SecBtn } from "../../components/Buttons";

var MONO = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

function workspaceKey(account) {
  var t = account && account.account_type;
  if (t === "internal_team") return "internal_team";
  if (t === "partner")       return "partner";
  return "customer";
}

export function AccountMergeModal({ source, accounts, onConfirm, onClose }) {
  var [search, setSearch] = useState("");
  var [target, setTarget] = useState(null);
  var [confirming, setConfirming] = useState(false);
  var [submitting, setSubmitting] = useState(false);

  var sourceWorkspace = workspaceKey(source);

  var candidates = useMemo(function () {
    var q = search.trim().toLowerCase();
    return (accounts || [])
      .filter(function (a) {
        if (a.id === source.id) return false;                       // can't merge into self
        if (workspaceKey(a) !== sourceWorkspace) return false;      // same workspace only
        if (a.is_inactive) return false;                            // don't merge into an archive
        if (!q) return true;
        return (a.name || "").toLowerCase().indexOf(q) !== -1
          || (a.account_number && a.account_number.toLowerCase().indexOf(q) !== -1)
          || (a.region && a.region.toLowerCase().indexOf(q) !== -1);
      })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); })
      .slice(0, 50);
  }, [accounts, source, sourceWorkspace, search]);

  function handleConfirm() {
    if (!target || submitting) return;
    setSubmitting(true);
    Promise.resolve(onConfirm(target.id)).finally(function () {
      setSubmitting(false);
    });
  }

  return (
    <Modal title="Merge Account" onClose={onClose} width={520}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.55, marginBottom: 10 }}>
          Move every meeting, item, contact, cadence, note, and project from{" "}
          <span style={{ color: C.text, fontFamily: SERIF, fontStyle: "italic" }}>{source.name}</span>{" "}
          onto another account. The source is then archived with a link back to the survivor.
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Pick target
        </div>
        <InputField
          value={search}
          onChange={function (e) { setSearch(e.target.value); setTarget(null); setConfirming(false); }}
          placeholder="Search by name, number, or region"
          autoFocus
        />
      </div>

      <div
        style={{
          maxHeight: 260, overflowY: "auto",
          border: "1px solid " + C.rule, borderRadius: 8,
          background: C.surface,
          marginBottom: 14,
        }}
      >
        {candidates.length === 0 ? (
          <div style={{ padding: "20px 16px", fontSize: 12, color: C.textMuted, textAlign: "center" }}>
            No matching accounts in this workspace.
          </div>
        ) : (
          candidates.map(function (a) {
            var active = target && target.id === a.id;
            return (
              <button
                key={a.id}
                onClick={function () { setTarget(a); setConfirming(false); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "9px 12px",
                  background: active ? C.accentFaint : "transparent",
                  border: "none",
                  borderBottom: "1px solid " + C.ruleSoft,
                  borderLeft: "3px solid " + (active ? C.accent : "transparent"),
                  cursor: "pointer", textAlign: "left",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  color: C.text,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: C.text, fontFamily: SERIF, fontWeight: 400 }}>
                    {a.name}
                  </div>
                  {(a.account_number || a.region) && (
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: MONO, marginTop: 2, letterSpacing: "0.04em" }}>
                      {[a.account_number ? "#" + a.account_number : null, a.region].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                {active && (
                  <span style={{ fontSize: 11, color: C.accent, fontFamily: MONO, fontWeight: 600, letterSpacing: "0.06em" }}>SELECTED</span>
                )}
              </button>
            );
          })
        )}
      </div>

      {target && (
        <div style={{
          background: C.accentFaint, border: "1px solid " + C.accentLine,
          borderRadius: 8, padding: "10px 14px", marginBottom: 14,
          fontSize: 13, color: C.textSub, lineHeight: 1.5,
        }}>
          {confirming ? (
            <>
              Merge <span style={{ fontFamily: SERIF, color: C.text }}>{source.name}</span> into{" "}
              <span style={{ fontFamily: SERIF, color: C.text }}>{target.name}</span>? This can't be undone.
            </>
          ) : (
            <>
              Ready to merge into <span style={{ fontFamily: SERIF, color: C.text }}>{target.name}</span>.
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <SecBtn onClick={onClose} style={{ fontSize: 12, padding: "6px 14px" }}>Cancel</SecBtn>
        {!confirming ? (
          <AmberBtn
            onClick={function () { if (target) setConfirming(true); }}
            disabled={!target}
            style={{ fontSize: 12, padding: "6px 14px", opacity: target ? 1 : 0.5 }}
          >
            Continue
          </AmberBtn>
        ) : (
          <AmberBtn
            onClick={handleConfirm}
            disabled={submitting}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            {submitting ? "Merging…" : "Merge it"}
          </AmberBtn>
        )}
      </div>
    </Modal>
  );
}
