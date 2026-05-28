// Account-detail tab nav — extracted from AccountDetail.jsx during the
// Phase 4 refactor. Renders the underlined tab row, handles slide-direction
// tracking on tab change, and reports the new tab back up via onChange so the
// parent owns the source-of-truth `tab` state.

import { C } from "../../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

export function AccountDetailTabs({ tabs, activeTab, onChange, shopCount }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        marginBottom: 16,
        borderBottom: "1px solid " + C.rule,
        paddingBottom: 0,
      }}
    >
      {tabs.map(function (t) {
        var isGauge = t === "projects";
        var active  = activeTab === t;
        return (
          <button
            key={t}
            onClick={function () {
              var oldIdx = tabs.indexOf(activeTab);
              var newIdx = tabs.indexOf(t);
              var dir    = newIdx >= oldIdx ? "right" : "left";
              onChange(t, dir);
            }}
            style={{
              padding: "8px 0",
              marginRight: 26,
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 400,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "transparent",
              color: active ? (isGauge ? C.blue : C.accent) : C.textMuted,
              border: "none",
              borderBottom: active ? "1.5px solid " + (isGauge ? C.blue : C.accent) : "1.5px solid transparent",
              marginBottom: -1,
            }}
          >
            {isGauge ? "Gauge" : t === "shops" ? (
              <span>
                Shops
                {shopCount > 0 && (
                  <span style={{
                    marginLeft: 5,
                    fontFamily: MONO, fontSize: 9.5,
                    color: active ? C.accent : C.textMuted,
                  }}>
                    ({shopCount})
                  </span>
                )}
              </span>
            ) : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
