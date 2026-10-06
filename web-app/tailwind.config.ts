import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Blue is the product's main colour; it reads CSS variables so a shop's theme set can
        // replace it everywhere (defaults = Tailwind's blue, app/globals.css).
        blue: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `rgb(var(--blue-${s}) / <alpha-value>)`]),
        ),
        brand: {
          // The staff app's accent: #FFC107 unless the shop picked its own colour (app/globals.css)
          yellow:         'rgb(var(--brand-accent) / <alpha-value>)',
          'yellow-hover': 'rgb(var(--brand-accent) / 0.85)',
          'yellow-light': 'rgb(var(--brand-accent) / 0.12)',
          'yellow-dark':  'rgb(var(--brand-accent) / 0.9)',
          'on-yellow':    'rgb(var(--brand-accent-fg) / <alpha-value>)',
          black:          '#111111',
          gray:           '#6B7280',
          light:          '#F8F9FB',
          'card-bg':      '#FFFFFF',
          success:        '#22C55E',
          warning:        '#F59E0B',
          danger:         '#EF4444',
          info:           'rgb(var(--blue-500) / <alpha-value>)',
        },
        fi: {
          primary:        'rgb(var(--blue-600) / <alpha-value>)',
          'primary-dark': 'rgb(var(--blue-700) / <alpha-value>)',
          'primary-light':'rgb(var(--blue-50) / <alpha-value>)',
          'primary-mid':  'rgb(var(--blue-100) / <alpha-value>)',
          success:        '#22C55E',
          'success-light':'#F0FDF4',
          warning:        '#F59E0B',
          'warning-light':'#FFFBEB',
          danger:         '#EF4444',
          'danger-light': '#FEF2F2',
          purple:         '#8B5CF6',
          'purple-light': '#F5F3FF',
          teal:           '#14B8A6',
          'teal-light':   '#F0FDFA',
          bg:             '#F8FAFC',
          surface:        '#FFFFFF',
          border:         '#E2E8F0',
          text:           '#111827',
          'text-2':       '#374151',
          'text-muted':   '#6B7280',
          'text-faint':   '#9CA3AF',
          'dark-bg':      '#0F172A',
          'dark-surface': '#1E293B',
          'dark-border':  '#334155',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
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
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'card':         '0 1px 4px -1px rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover':   '0 8px 20px -4px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
        'soft':         '0 2px 8px -2px rgb(0 0 0 / 0.07)',
        'panel':        '0 4px 16px -4px rgb(0 0 0 / 0.08)',
        'fi-card':      '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'fi-card-hover':'0 8px 20px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
        'fi-panel':     '0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'fi-modal':     '0 20px 60px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)',
        'fi-primary':   '0 4px 14px rgb(var(--blue-600) / 0.30)',
        'fi-success':   '0 4px 14px rgba(34,197,94,0.25)',
        'fi-inset':     'inset 0 1px 3px rgba(0,0,0,0.06)',
      },
      fontFamily: {
        sans:   ['var(--font-prompt)', 'var(--font-noto-thai)', 'Prompt', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
        prompt: ['var(--font-prompt)', 'Prompt', 'sans-serif'],
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
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-up':        'fade-up 0.25s ease-out',
        'fade-in':        'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
