import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // SPA navigation fallback must NOT swallow real static pages
        // (mockup review pages live at /mockups/*)
        navigateFallbackDenylist: [/^\/mockups\//],
        // AI model WASM files are too large to precache and only used when
        // Kokoro TTS is active — let the browser HTTP cache handle them.
        globIgnores: ["**/*.wasm"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB (vendor chunk)
      },
      manifest: {
        name: "Folios",
        short_name: "Folios",
        description: "Account Management",
        theme_color: "#0D1F1C",
        background_color: "#0D1F1C",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        share_target: {
          action: "/share-target",
          method: "GET",
          params: {
            title: "title",
            text:  "text",
            url:   "url",
          },
        },
      },
    }),
  ],
  optimizeDeps: {
    exclude: ["kokoro-js"],
  },
  build: {
    // "hidden" emits .map files alongside the bundle (so a minified crash like
    // index-XXXX.js:258:663 can be resolved back to the real src/ file + line)
    // but omits the //# sourceMappingURL comment — so the maps aren't auto-
    // loaded by visitors' devtools. Used to decode stress-bot / folio_errors
    // stacks after a deploy.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks: function (id) {
          if (id.indexOf("node_modules") === -1) return undefined;
          if (id.indexOf("@supabase") !== -1) return "supabase";
          if (id.indexOf("react-dom") !== -1 || /node_modules\/react\//.test(id)) return "react";
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
  },
});
