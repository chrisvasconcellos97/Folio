import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { showToast } from "./components/Toast";

// With skipWaiting+clientsClaim, a new SW activates silently and `onNeedRefresh`
// never fires. The page keeps running stale JS. Listening to `controllerchange`
// is the canonical signal that a new SW took over — we reload then.
// We skip the *first* controllerchange (which fires on a fresh visit when the
// SW takes initial control) so first-time visitors aren't bounced.
var hadControllerAtStart = "serviceWorker" in navigator ? !!navigator.serviceWorker.controller : true;
var reloading = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloading) return;
    if (!hadControllerAtStart) { hadControllerAtStart = true; return; }
    reloading = true;
    showToast("Updating Folios…", "warning");
    setTimeout(function () { window.location.reload(); }, 400);
  });
}

var updateSW = registerSW({
  immediate: true,
  onNeedRefresh: function () {
    if (reloading) return;
    reloading = true;
    showToast("Updating Folios…", "warning");
    setTimeout(function () { updateSW(true); }, 400);
  },
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
