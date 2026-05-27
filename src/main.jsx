import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/jetbrains-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { showToast } from "./components/Toast";

var updateSW = registerSW({
  immediate: true,
  onNeedRefresh: function () {
    showToast("New version available — refresh to update", {
      action: { label: "Refresh", run: function () { updateSW(true); } },
      sticky: true,
    });
  },
  onRegisteredSW: function (_swUrl, registration) {
    if (!registration) return;
    setInterval(function () { registration.update(); }, 60 * 60 * 1000);
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
