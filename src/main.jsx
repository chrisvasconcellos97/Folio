import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { showToast } from "./components/Toast";

// === Update path 1: controllerchange (the "right" way, when it works) ===
var hadControllerAtStart = "serviceWorker" in navigator ? !!navigator.serviceWorker.controller : true;
var reloading = false;

function triggerReload() {
  if (reloading) return;
  reloading = true;
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
    <App />
  </StrictMode>
);
