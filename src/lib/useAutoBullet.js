import { useRef, useCallback } from "react";

// Auto-bullet behavior for a textarea. Returns props you spread onto the
// <textarea>. Pass the current value, the setter, and whether the feature
// is enabled (most callers persist this in localStorage).
//
// Behavior when enabled:
//   - First focus into an empty textarea pre-inserts "• " so you start
//     in bullet mode.
//   - Enter inserts a newline + "• " so the next line stays bulleted.
//   - Enter on a line that's just "• " (empty bullet) removes the bullet
//     and exits bullet mode — gives you a clean line for paragraphs.
//   - Backspace right after "• " at line start removes both characters
//     at once, so escaping from a bullet doesn't need two keystrokes.
//   - Paste normalizes external bullet styles ("- ", "* ", "· ", "‣ ",
//     "▪ ", "● ") to "• " so pasted notes look consistent. Numbered
//     list markers ("1. ", "2) ") pass through untouched.
//
// Everything stays plain text — no rich editor, no schema impact. The
// bullets are part of the saved string and Pip reads them fine.
export function useAutoBullet({ value, onChange, enabled }) {
  // Stable refs so the handlers don't re-create on every keystroke and
  // cause focus / cursor jitter.
  var valueRef    = useRef(value);
  var onChangeRef = useRef(onChange);
  var enabledRef  = useRef(enabled);
  valueRef.current    = value;
  onChangeRef.current = onChange;
  enabledRef.current  = enabled;

  function emit(textarea, nextValue, nextCaret) {
    onChangeRef.current(nextValue);
    requestAnimationFrame(function () {
      try {
        textarea.selectionStart = nextCaret;
        textarea.selectionEnd   = nextCaret;
      } catch (e) { /* swallow — DOM may have unmounted */ }
    });
  }

  var onKeyDown = useCallback(function (e) {
    if (!enabledRef.current) return;
    var ta    = e.target;
    var val   = valueRef.current || "";
    var caret = ta.selectionStart;

    if (e.key === "Enter" && !e.shiftKey) {
      var lineStart   = val.lastIndexOf("\n", caret - 1) + 1;
      var currentLine = val.slice(lineStart, caret);

      // Empty bullet line + Enter → strip the bullet, exit bullet mode.
      if (currentLine === "• ") {
        e.preventDefault();
        var stripped = val.slice(0, lineStart) + val.slice(caret);
        emit(ta, stripped, lineStart);
        return;
      }

      // Otherwise insert newline + bullet so the next line continues bulleted.
      e.preventDefault();
      var next = val.slice(0, caret) + "\n• " + val.slice(caret);
      emit(ta, next, caret + 3);
      return;
    }

    if (e.key === "Backspace" && ta.selectionStart === ta.selectionEnd) {
      var ls = val.lastIndexOf("\n", caret - 1) + 1;
      // Cursor is right after "• " at line start → kill both chars in one tap.
      if (caret === ls + 2 && val.slice(ls, caret) === "• ") {
        e.preventDefault();
        var deleted = val.slice(0, ls) + val.slice(caret);
        emit(ta, deleted, ls);
      }
    }
  }, []);

  var onPaste = useCallback(function (e) {
    if (!enabledRef.current) return;
    var cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    var pasted = cd.getData("text/plain");
    if (!pasted) return;

    // Normalize line endings, then rewrite leading bullet markers per line
    // to "• ". Matches common variants from Notes, Slack, Gmail, Word, etc.
    // Leading whitespace is preserved so indented sub-bullets keep structure.
    var lines = pasted.replace(/\r\n?/g, "\n").split("\n");
    var rewritten = lines.map(function (line) {
      // [whitespace][marker][space][rest] — marker is one of - * · ‣ ▪ ● • ◦
      var m = line.match(/^(\s*)([-*·‣▪●•◦])\s+(.*)$/);
      if (m) return m[1] + "• " + m[3];
      return line;
    }).join("\n");

    // Only intercept if we actually changed something OR the pasted block
    // contains newlines (so the surrounding text stays in bullet mode).
    if (rewritten === pasted && pasted.indexOf("\n") === -1) return;

    e.preventDefault();
    var ta    = e.target;
    var val   = valueRef.current || "";
    var start = ta.selectionStart;
    var end   = ta.selectionEnd;
    var next  = val.slice(0, start) + rewritten + val.slice(end);
    emit(ta, next, start + rewritten.length);
  }, []);

  var onFocus = useCallback(function (e) {
    if (!enabledRef.current) return;
    var ta = e.target;
    if ((valueRef.current || "") === "") {
      onChangeRef.current("• ");
      requestAnimationFrame(function () {
        try {
          ta.selectionStart = 2;
          ta.selectionEnd   = 2;
        } catch (err) { /* swallow */ }
      });
    }
  }, []);

  return { onKeyDown: onKeyDown, onFocus: onFocus, onPaste: onPaste };
}
