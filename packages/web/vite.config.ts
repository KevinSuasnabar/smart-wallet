import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import mkcert from 'vite-plugin-mkcert';
import path from 'node:path';

// Vite config runs as ESM (package.json has "type": "module"), so __dirname is
// undefined. Use import.meta.dirname (Node 20.11+) for the project root.
const projectRoot = import.meta.dirname;

// `command` is 'serve' for `vite dev` / `vite preview` and 'build' for `vite build`.
// mkcert() is gated to 'serve' so the production build never loads it and stays byte-identical.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // user-driven update, pairs with the sonner toast
      injectRegister: null, // we register via virtual:pwa-register/react — no registerSW.js emitted
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Smart Wallet',
        short_name: 'SWallet',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF6EB',
        theme_color: '#FAF6EB',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        globIgnores: ['**/*.map'], // build.sourcemap === true; do not precache maps
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 }, // 1 week
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false }, // no SW in `vite dev`; test via `vite preview`
    }),
    ...(command === 'serve' ? [mkcert()] : []),
  ],
  resolve: {
    alias: { '@': path.resolve(projectRoot, './src') },
  },
  // amazon-cognito-identity-js depends on the Node 'buffer' package which references the
  // Node-only `global`. In the browser this is undefined — alias it to globalThis to fix
  // "ReferenceError: global is not defined" on first import of the Cognito SDK.
  // `define` covers OUR source code; `optimizeDeps.esbuildOptions.define` covers the
  // pre-bundled deps in node_modules/.vite/deps/ where the Cognito SDK lives.
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  envPrefix: 'VITE_',
}));
