import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// En GitHub Pages la app vive en /maquina_duihuo/
const base = process.env.BASE_PATH ?? "/maquina_duihuo/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "对货 · 送货单",
        short_name: "对货",
        description: "上传送货单，扫条码查看进价和数量。",
        lang: "zh-CN",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f5f7fb",
        theme_color: "#1d4ed8",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,mjs,wasm}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"], // las pruebas de supabase/functions son de Deno
  },
});
