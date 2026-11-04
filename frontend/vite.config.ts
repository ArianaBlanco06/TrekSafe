import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveBackendPort(): number {
  try {
    const envFile = readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8');
    const match = envFile.match(/^PORT=(\d+)/m);
    if (match) return Number(match[1]);
  } catch {
    /* backend/.env no disponible */
  }
  return 3000;
}

const backendPort = resolveBackendPort();

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'autoUpdate' recarga todas las ventanas abiertas al activarse un Service Worker nuevo, y eso
      // descarta formularios a medio editar. Así, la versión nueva se activa al cerrar las pestañas.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TrekSafe',
        short_name: 'TrekSafe',
        description: 'Monitoreo pasivo para senderistas en alta montaña',
        theme_color: '#16a34a',
        background_color: '#f0f5f1',
        display: 'standalone',
        start_url: '/',
        lang: 'es',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        importScripts: ['sw-privacy.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(?:api|rest\/v1)(?:\/|$)/],
        runtimeCaching: [
          {
            // No hay respuestas API autorizadas para almacenamiento offline.
            // Authorization cubre tambien APIs configuradas en otro origen.
            // Incluye el plan de HU-26 cuya versionEsperada exige una lectura vigente.
            // Tambien cubre las listas personales de equipo de HU-30.
            urlPattern: ({ request, url }) => request.headers.has('authorization')
              || /^\/(?:api|rest\/v1)(?:\/|$)/.test(url.pathname),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
