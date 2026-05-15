import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Design system: editorial monochrome frame + oversized pastel color blocks.
 * Adapted from DESIGN.md (Figma marketing system) for an authenticated app:
 * - Monochrome core (pure black/white), hierarchy carried by font weight.
 * - Pastel `block-*` colors used as accents (balance, empty states, headers).
 * - Pill is the only CTA shape; hairline borders instead of shadows.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // DESIGN.md raw aliases — pure black ink on pure white canvas.
        ink: '#000000',
        canvas: '#ffffff',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Oversized pastel color blocks — the signature surface of the system.
        block: {
          lime: '#dceeb1',
          lilac: '#c5b0f4',
          cream: '#f4ecd6',
          pink: '#efd4d4',
          mint: '#c8e6cd',
          coral: '#f3c9b6',
          navy: '#1f1d3d',
        },
        // Single-shot promo accent + semantic success glyph.
        magenta: '#ff3d8b',
        success: '#1ea64a',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // DESIGN.md named scale: cards/large frames vs. oversized callouts.
        block: '24px',
        panel: '32px',
      },
      letterSpacing: {
        // figmaMono eyebrows/captions run positive tracking.
        eyebrow: '0.08em',
        caption: '0.05em',
        // Display headings pull tight negative tracking.
        display: '-0.03em',
        tightest: '-0.02em',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
