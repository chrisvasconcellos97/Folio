import { C } from "../../lib/colors";
import { Modal } from "../../components/Modal";

var MONO  = "'JetBrains Mono', ui-monospace, monospace";
var SERIF = "'Fraunces', Georgia, serif";

export function TemplatePickerModal({ templates, onUse, onClose }) {
  return (
    <Modal title="Choose a Template" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(!templates || templates.length === 0) ? (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
            color: C.textMuted,
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            No templates yet — save a project as a template to reuse it.
          </div>
        ) : (
          templates.map(function (tpl) {
            var stageCount = tpl.stages ? tpl.stages.length : 0;
            return (
              <div
                key={tpl.id}
                style={{
                  background: C.surface2,
                  border: "1px solid " + C.rule,
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 15, color: C.text, lineHeight: 1.3, marginBottom: 3 }}>
                    {tpl.title}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: C.textMuted }}>
                    {stageCount} stage{stageCount !== 1 ? "s" : ""}
                    {tpl.description ? " · " + tpl.description.slice(0, 60) + (tpl.description.length > 60 ? "…" : "") : ""}
                  </div>
                </div>
                <button
                  onClick={function () {
                    // Reset completed_at on stages before passing to project modal
                    var cleanedTpl = Object.assign({}, tpl, {
                      stages: (tpl.stages || []).map(function (s) {
                        return Object.assign({}, s, {
                          completed_at: null,
                          sub_stages: (s.sub_stages || []).map(function (sub) {
                            return Object.assign({}, sub, { completed_at: null });
                          }),
                        });
                      }),
                    });
                    onUse(cleanedTpl);
                  }}
                  style={{
                    background: C.accentDeep,
                    border: "none",
                    borderRadius: 6,
                    padding: "7px 16px",
                    color: C.bg,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Use
                </button>
              </div>
            );
          })
        )}

        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid " + C.border,
            borderRadius: 20,
            padding: "8px 18px",
            fontSize: 12,
            fontWeight: 600,
            color: C.textSoft,
            fontFamily: "'Inter', system-ui, sans-serif",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
