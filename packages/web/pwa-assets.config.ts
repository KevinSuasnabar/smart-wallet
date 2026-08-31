import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/**
 * Generates the committed PWA icon set from the hand-authored source SVG.
 * Run manually: `pnpm --filter @smart-wallet/web generate-pwa-assets`.
 *
 * The `minimal-2023` preset emits exactly:
 *   - pwa-64x64.png, pwa-192x192.png, pwa-512x512.png (transparent)
 *   - maskable-icon-512x512.png (maskable)
 *   - apple-touch-icon-180x180.png (apple)
 *   - favicon.ico
 *
 * iOS ignores transparency and SVG, so the apple icon is forced opaque:
 * padding 0 (full-bleed) + a navy background fill behind any transparent pixels.
 */
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: {
      ...minimal2023Preset.apple,
      padding: 0,
      resizeOptions: { background: '#201E3E' },
    },
  },
  images: ['public/favicon.svg'],
});
