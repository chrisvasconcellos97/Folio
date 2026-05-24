import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Folio",
        short_name: "Folio",
        description: "Account Management by Briefcase",
        theme_color: "#0D1F1C",
        background_color: "#0D1F1C",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  build: { sourcemap: false },
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
