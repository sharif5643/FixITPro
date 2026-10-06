'use client'

import { Check } from 'lucide-react'
import { THEME_CHOICES, ORIGINAL_THEME } from '@/lib/theme-sets'

/** Cards for picking a theme set: four colour stripes, the name and the colours it mixes. */
export function ThemeSetPicker({ value, onChange }: { value: string | null | undefined; onChange: (key: string) => void }) {
  const current = value || ORIGINAL_THEME
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {THEME_CHOICES.map((t) => {
        const on = current === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={on}
            className={`relative flex items-center gap-3 rounded-xl border bg-white p-2.5 text-left transition-shadow dark:bg-slate-900 ${
              on ? 'border-slate-900 ring-2 ring-slate-900 dark:border-white dark:ring-white' : 'border-slate-200 hover:shadow-md dark:border-slate-700'
            }`}
          >
            <span className="flex h-10 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10">
              {t.swatch.map((c, i) => <span key={i} className="h-full flex-1" style={{ backgroundColor: c }} />)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{t.name}</span>
              <span className="block truncate text-xs text-slate-500">{t.desc}</span>
            </span>
            {on && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                <Check className="h-3 w-3" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
