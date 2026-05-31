import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        // Solid variants
        default:     'border-transparent bg-primary text-primary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',

        // Soft variants (modern SaaS style)
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline:   'text-foreground border-border',
        muted:     'border-transparent bg-muted text-muted-foreground',

        // Semantic soft colors
        success:  'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400',
        warning:  'border-amber-200  bg-amber-100  text-amber-700  dark:border-amber-800  dark:bg-amber-900/40  dark:text-amber-400',
        danger:   'border-red-200    bg-red-100    text-red-700    dark:border-red-800    dark:bg-red-900/40    dark:text-red-400',
        info:     'border-blue-200   bg-blue-100   text-blue-700   dark:border-blue-800   dark:bg-blue-900/40   dark:text-blue-400',
        purple:   'border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800 dark:bg-purple-900/40 dark:text-purple-400',
        orange:   'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-900/40 dark:text-orange-400',
        teal:     'border-teal-200   bg-teal-100   text-teal-700   dark:border-teal-800   dark:bg-teal-900/40   dark:text-teal-400',

        // Legacy aliases
        'success-solid': 'border-transparent bg-emerald-500 text-white',
        'warning-solid': 'border-transparent bg-amber-500  text-white',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
