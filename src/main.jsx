import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { showToast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/errorLog";
import { PipStateProvider } from "./lib/pipState";

// Wire window.onerror + unhandledrejection handlers immediately so we catch
// anything that explodes during initial render. Idempotent.
installGlobalErrorHandlers();

// === Update path 1: controllerchange (the "right" way, when it works) ===
var hadControllerAtStart = "serviceWorker" in navigator ? !!navigator.serviceWorker.controller : true;
var reloading = false;
var RELOAD_COOLDOWN_MS = 60 * 1000;
var RELOAD_TS_KEY = "folio_last_reload_ts";

function recentlyReloaded() {
  try {
    var ts = parseInt(sessionStorage.getItem(RELOAD_TS_KEY) || "0", 10);
    if (!ts) return false;
    return Date.now() - ts < RELOAD_COOLDOWN_MS;
  } catch (e) { return false; }
}

function triggerReload() {
  if (reloading) return;
  // Cross-load guard: if we just reloaded within the cooldown, suppress.
  // Mid-deploy the served index.html can flip-flop between two bundle hashes
  // across CDN edges, which previously caused a reload-every-second loop.
  if (recentlyReloaded()) return;
  reloading = true;
  try { sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now())); } catch (e) {}
  showToast("Updating Folios…", "warning");
  setTimeout(function () { window.location.reload(); }, 400);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadControllerAtStart) { hadControllerAtStart = true; return; }
    triggerReload();
  });
}

// === Update path 2: version polling (fallback when the SW path is stuck) ===
// Compare the hashed bundle name in the page's <script src> against a fresh
// fetch of /. If they differ, a new build is live and we reload — no SW needed.
function currentBundleHash() {
  var s = document.querySelector('script[src*="/assets/index-"]');
  if (!s) return null;
  var m = (s.getAttribute("src") || "").match(/index-([A-Za-z0-9_-]+)\.js/);
  return m ? m[1] : null;
}

var LOADED_HASH = currentBundleHash();

function checkVersion() {
  if (reloading || !LOADED_HASH) return;
  fetch("/?_v=" + Date.now(), { cache: "no-store" })
    .then(function (r) { return r.ok ? r.text() : null; })
    .then(function (html) {
      if (!html) return;
      var m = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
      if (!m) return;
      if (m[1] !== LOADED_HASH) triggerReload();
    })
    .catch(function () {});
}

checkVersion();
setInterval(checkVersion, 3 * 60 * 1000);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") checkVersion();
});

// === Update path 3: stale-chunk reactive trigger ===
// errorLog.js and ErrorBoundary.jsx detect the chunk-load failure pattern
// (text/html MIME, ChunkLoadError, "Failed to fetch dynamically imported
// module") and fire this event. We reload immediately rather than waiting
// for the next 3-min poll, with the existing cooldown guarding against
// reload loops during a mid-deploy flip-flop.
window.addEventListener("folio:chunk-reload-detected", function () { triggerReload(); });

// === Standard PWA registration (idempotent — SW handles offline + caching) ===
var updateSW = registerSW({
  immediate: true,
  onNeedRefresh: function () { triggerReload(); },
  onRegisteredSW: function (_swUrl, registration) {
    if (!registration) return;
    registration.update();
    setInterval(function () { registration.update(); }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") registration.update();
    });
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary label="app">
      <PipStateProvider>
        <App />
      </PipStateProvider>
    </ErrorBoundary>
  </StrictMode>
);
