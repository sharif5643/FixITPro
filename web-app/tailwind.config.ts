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
        brand: {
          yellow:         '#FFC107',
          'yellow-hover': '#E6AC00',
          'yellow-light': '#FFF8E1',
          'yellow-dark':  '#CC9A00',
          black:          '#111111',
          gray:           '#6B7280',
          light:          '#F8F9FB',
          'card-bg':      '#FFFFFF',
          success:        '#22C55E',
          warning:        '#F59E0B',
          danger:         '#EF4444',
          info:           '#3B82F6',
        },
        fi: {
          primary:        '#2563EB',
          'primary-dark': '#1D4ED8',
          'primary-light':'#EFF6FF',
          'primary-mid':  '#DBEAFE',
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
        'fi-primary':   '0 4px 14px rgba(37,99,235,0.30)',
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
