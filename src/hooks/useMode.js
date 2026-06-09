import { useState, useEffect, useCallback } from "react";

// ── Work / Life mode persistence ─────────────────────────────────────────────
// Folios is one app with two lenses: "work" (account management, the default,
// shades of green) and "life" (personal assistant — appointments, events,
// honey-do — shades of dusty blue). The palette swap happens via CSS variables
// on `<html data-mode="…">` (see index.html `[data-mode="life"]` overrides),
// exactly like the dark/light theme system — so switching is instant with no
// remount; every C.* token resolves through the live CSS-var values.
//
// This hook owns: reading the persisted choice (already applied pre-mount by
// the inline <script> in index.html, so no flash), updating the dataset on
// `<html>`, and persisting to localStorage. Pip is the one brain that spans
// both modes; the modes only diverge in the UI.

var STORAGE_KEY = "folio_mode";

function readInitial() {
  if (typeof document === "undefined") return "work";
  var fromDom = document.documentElement.dataset.mode;
  if (fromDom === "life" || fromDom === "work") return fromDom;
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "life" || stored === "work") return stored;
  } catch (_e) { /* ignore */ }
  return "work";
}

function applyMode(mode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.mode = mode;
}

export function useMode() {
  var [mode, setModeState] = useState(readInitial);

  useEffect(function () { applyMode(mode); }, [mode]);

  var setMode = useCallback(function (next) {
    if (next !== "life" && next !== "work") return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
    applyMode(next);
    setModeState(next);
  }, []);

  var toggleMode = useCallback(function () {
    setModeState(function (prev) {
      var next = prev === "life" ? "work" : "life";
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
      applyMode(next);
      return next;
    });
  }, []);

  return { mode: mode, setMode: setMode, toggleMode: toggleMode };
}
