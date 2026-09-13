import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages has no SPA fallback, so deep links (/collet/guide/m/wood) would 404.
// Pages serves 404.html for unknown paths — make it a copy of the app shell and
// BrowserRouter takes it from there (the URL is preserved).
function pagesSpaFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pages-spa-fallback',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
    },
  };
}

// COLLET is a fully local PWA: no backend, no analytics, no cloud.
// Served from the /collet/ subpath on GitHub Pages (https://libreble.github.io/collet/).
export default defineConfig({
  base: '/collet/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/collet/',
        start_url: '/collet/',
        scope: '/collet/',
        name: 'COLLET — Dremel 8260 companion',
        short_name: 'COLLET',
        description:
          'Live telemetry, speed control and an accessory & material speed guide for the Dremel 8260. Everything stays on your device.',
        theme_color: '#0b1017',
        background_color: '#0b1017',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell, icons and the bundled guide data so the whole
        // guide works offline. The tool link is local BLE — no server needed.
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        navigateFallback: '/collet/index.html',
      },
    }),
    pagesSpaFallback(),
  ],
});
