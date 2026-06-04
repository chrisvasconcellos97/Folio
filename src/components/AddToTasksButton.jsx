import { C } from "../lib/colors";
import { showToast } from "./Toast";

function parseActionItems(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(function (l) { return l.replace(/^\s*[-*•\d+.]+\s*/, "").trim(); })
    .filter(function (l) { return l.length > 0; });
}

function normalize(s) { return (s || "").toLowerCase().trim().replace(/\s+/g, " "); }

export function AddToTasksButton({ actionItemsText, accountId, openItems, addItem, style }) {
  var lines = parseActionItems(actionItemsText);
  if (lines.length === 0) return null;

  function handleClick(e) {
    e.stopPropagation();
    var existing = new Set((openItems || []).map(function (i) { return normalize(i.text); }));
    var fresh = lines.filter(function (l) { return !existing.has(normalize(l)); });
    if (fresh.length === 0) { showToast("All items already in tasks"); return; }
    var ops = fresh.map(function (text) { return addItem({ text: text, account_id: accountId, done: false }); });
    Promise.all(ops).then(function () {
      var n  = fresh.length;
      var sk = lines.length - n;
      showToast(n + " task" + (n !== 1 ? "s" : "") + " added" + (sk > 0 ? " · " + sk + " duplicate" + (sk !== 1 ? "s" : "") + " skipped" : ""));
    }).catch(function () {
      showToast("Couldn't add tasks", "error");
    });
  }

  return (
    <button
      onClick={handleClick}
      title="Add each action item as a task"
      style={Object.assign({
        background: C.yellowFaint,
        border: "1px solid " + C.yellow,
        borderRadius: 6,
        padding: "3px 9px",
        fontSize: 10,
        fontWeight: 600,
        color: C.yellow,
        cursor: "pointer",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }, style || {})}
    >
      → Tasks
    </button>
  );
}
