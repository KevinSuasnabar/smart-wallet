import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
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
});
