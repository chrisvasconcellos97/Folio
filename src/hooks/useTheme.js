import { useState, useEffect, useCallback } from "react";

// ── Theme persistence ────────────────────────────────────────────────────────
// Two-theme system: "dark" (default, canonical) + "light" (paper/cream).
// The actual palette swap happens via CSS variables on
// `<html data-theme="…">` — see index.html. This hook only owns:
//   1. Reading the persisted choice (already applied pre-mount by the inline
//      <script> in index.html, so no flash-of-wrong-theme).
//   2. Updating the dataset on `<html>` when the user toggles.
//   3. Keeping <meta name="theme-color"> in sync so iOS chrome matches.
//   4. Persisting the choice to localStorage.
//
// Consumers can both READ the current theme and SET a new one. Switching is
// instant — no remount needed, because every styled component resolves color
// via the live CSS-var values.

var STORAGE_KEY = "folio_theme";
var THEME_COLOR_META = { dark: "#07100f", light: "#f6f4ef" };

function readInitial() {
  if (typeof document === "undefined") return "dark";
  // The inline script in index.html already set this; trust it as source of truth.
  var fromDom = document.documentElement.dataset.theme;
  if (fromDom === "light" || fromDom === "dark") return fromDom;
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch (_e) { /* ignore */ }
  return "dark";
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  var meta = document.getElementById("meta-theme-color")
          || document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR_META[theme]);
}

export function useTheme() {
  var [theme, setThemeState] = useState(readInitial);

  // Re-sync on mount (covers SSR/strict-mode double-invoke quirks).
  useEffect(function () { applyTheme(theme); }, [theme]);

  var setTheme = useCallback(function (next) {
    if (next !== "light" && next !== "dark") return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
    applyTheme(next);
    setThemeState(next);
  }, []);

  var toggleTheme = useCallback(function () {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  return { theme: theme, setTheme: setTheme, toggleTheme: toggleTheme };
}
