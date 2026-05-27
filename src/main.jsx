import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { showToast } from "./components/Toast";

// Auto-reload on update. Folios autosaves everything (notes, drafts, items)
// so a silent refresh is safe. A 2s toast hints at why the page just blipped.
var updateSW = registerSW({
  immediate: true,
  onNeedRefresh: function () {
    showToast("Updating Folios…", "warning");
    setTimeout(function () { updateSW(true); }, 600);
  },
  onRegisteredSW: function (_swUrl, registration) {
    if (!registration) return;
    setInterval(function () { registration.update(); }, 10 * 60 * 1000);
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
