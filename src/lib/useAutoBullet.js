import { useRef, useCallback } from "react";

// Auto-bullet behavior for a textarea. Returns props you spread onto the
// <textarea>. Pass the current value, the setter, and whether the feature
// is enabled (most callers persist this in localStorage).
//
// Behavior when enabled:
//   - First focus into an empty textarea pre-inserts "• " so you start
//     in bullet mode.
//   - Enter inserts a newline + "• " so the next line stays bulleted.
//     Leading indentation of the current line is preserved, so pressing
//     Enter inside a sub-bullet keeps you at the same nesting depth.
//   - Enter on a line that's just "• " (empty bullet, at any indent) removes
//     the bullet and exits bullet mode — gives you a clean line for paragraphs.
//   - Tab indents the current line (or every line in a multi-line selection)
//     by two spaces to make a sub-bullet; Shift+Tab outdents. Tab is captured
//     so focus never escapes the notepad mid-note. Indentation is plain text,
//     so Pip reads the nesting as hierarchy (which detail belongs to which point).
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

  var INDENT = "    "; // four spaces per nesting level — visibly deeper sub-bullets

  var onKeyDown = useCallback(function (e) {
    var ta    = e.target;
    var val   = valueRef.current || "";
    var caret = ta.selectionStart;

    // Auto-capitalize runs regardless of bullet mode — phone-keyboard behavior.
    // A single lowercase letter typed at the start of a bullet/line, the very
    // start of the note, or right after sentence-ending punctuation + space
    // becomes uppercase. Plain text in, plain text out.
    if (/^[a-z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey &&
        ta.selectionStart === ta.selectionEnd) {
      var before = val.slice(0, caret);
      var atSentenceStart =
        before === "" ||
        /(^|\n)\s*(• )?$/.test(before) ||           // start of line / bullet
        /[.!?]["')\]]?\s+$/.test(before);            // after . ! ? + space
      if (atSentenceStart) {
        e.preventDefault();
        var cap  = e.key.toUpperCase();
        var capVal = val.slice(0, caret) + cap + val.slice(ta.selectionEnd);
        emit(ta, capVal, caret + 1);
        return;
      }
    }

    if (!enabledRef.current) return;

    // Tab / Shift+Tab → indent / outdent (sub-bullets). Captured so focus
    // never leaves the notepad while taking notes.
    if (e.key === "Tab") {
      e.preventDefault();
      var selStart = ta.selectionStart;
      var selEnd   = ta.selectionEnd;
      var firstLineStart = val.lastIndexOf("\n", selStart - 1) + 1;

      // Single caret — indent/outdent just this line.
      if (selStart === selEnd) {
        if (e.shiftKey) {
          var removable = 0;
          while (removable < INDENT.length && val[firstLineStart + removable] === " ") removable++;
          if (removable === 0) return;
          var outVal   = val.slice(0, firstLineStart) + val.slice(firstLineStart + removable);
          var outCaret = Math.max(firstLineStart, selStart - removable);
          emit(ta, outVal, outCaret);
        } else {
          var inVal = val.slice(0, firstLineStart) + INDENT + val.slice(firstLineStart);
          emit(ta, inVal, selStart + INDENT.length);
        }
        return;
      }

      // Multi-line selection — indent/outdent every line in the range.
      var region   = val.slice(firstLineStart, selEnd);
      var delta    = 0;
      var newRegion = region.split("\n").map(function (line) {
        if (e.shiftKey) {
          var r = 0;
          while (r < INDENT.length && line[r] === " ") r++;
          delta -= r;
          return line.slice(r);
        }
        delta += INDENT.length;
        return INDENT + line;
      }).join("\n");
      var nextVal = val.slice(0, firstLineStart) + newRegion + val.slice(selEnd);
      onChangeRef.current(nextVal);
      requestAnimationFrame(function () {
        try {
          ta.selectionStart = firstLineStart;
          ta.selectionEnd   = selEnd + delta;
        } catch (er) { /* swallow — DOM may have unmounted */ }
      });
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      var lineStart   = val.lastIndexOf("\n", caret - 1) + 1;
      var currentLine = val.slice(lineStart, caret);
      var indent      = (currentLine.match(/^(\s*)/) || ["", ""])[1];

      // Empty bullet line (at any indent) + Enter → strip it, exit bullet mode.
      if (/^\s*• $/.test(currentLine)) {
        e.preventDefault();
        var stripped = val.slice(0, lineStart) + val.slice(caret);
        emit(ta, stripped, lineStart);
        return;
      }

      // Checkbox lines ([ ] or [x]) get a plain newline — no bullet prefix.
      if (/^\s*\[/.test(currentLine)) {
        e.preventDefault();
        var cbNext = val.slice(0, caret) + "\n" + val.slice(caret);
        emit(ta, cbNext, caret + 1);
        return;
      }

      // Otherwise newline + same indent + bullet, so nesting depth carries over.
      e.preventDefault();
      var insert = "\n" + indent + "• ";
      var next   = val.slice(0, caret) + insert + val.slice(caret);
      emit(ta, next, caret + insert.length);
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
