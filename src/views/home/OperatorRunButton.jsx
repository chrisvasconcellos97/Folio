import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/colors";
import { showToast } from "../../components/Toast";

// Manual trigger for the Pip operator pass. The cron is retired — the pass now
// runs only when the user taps this. Authenticates with the user's own JWT, so
// api/operator-run scopes the run strictly to them (no cron secret in the
// browser). The run takes ~20-40s; we show a working state and refetch the
// report on completion.
export function OperatorRunButton({ onDone, hasReport }) {
  var [running, setRunning] = useState(false);

  function run() {
    if (running) return;
    setRunning(true);
    showToast("Pip's working your book — about 30 seconds ✦", "info", 8000);
    supabase.auth.getSession().then(function (s) {
      var token = s && s.data && s.data.session && s.data.session.access_token;
      if (!token) { setRunning(false); showToast("Session expired — reload and try again", "warning"); return null; }
      return fetch("/api/operator-run", { method: "GET", headers: { Authorization: "Bearer " + token } })
        .then(function (r) { return r.ok; })
        .then(function (ok) {
          setRunning(false);
          if (!ok) { showToast("Pip couldn't finish the pass — try again", "warning"); return; }
          showToast("Pip's read is ready ✦", "success");
          if (onDone) onDone();
        });
    }).catch(function () {
      setRunning(false);
      showToast("Pip couldn't finish the pass — try again", "warning");
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={running}
      style={{
        background: running ? C.surface : (hasReport ? "transparent" : C.accentFaint),
        border: "1px solid " + (hasReport ? C.rule : C.accentLine),
        borderRadius: 8,
        padding: hasReport ? "6px 12px" : "10px 16px",
        fontSize: hasReport ? 12 : 13.5,
        fontWeight: 600,
        color: running ? C.textMuted : C.accent,
        cursor: running ? "default" : "pointer",
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {running ? "Pip's working… (~30s)" : (hasReport ? "↻ Refresh Pip's read" : "✦ Run Pip's pass")}
    </button>
  );
}
