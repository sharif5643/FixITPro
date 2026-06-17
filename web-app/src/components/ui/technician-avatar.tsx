import { cn } from '@/lib/utils'

const PALETTE = [
  'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300',
  'bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300',
  'bg-emerald-200 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300',
  'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300',
  'bg-teal-200 dark:bg-teal-800 text-teal-700 dark:text-teal-300',
  'bg-rose-200 dark:bg-rose-800 text-rose-700 dark:text-rose-300',
]

const SIZE_CLS = {
  xs: 'h-3.5 w-3.5 text-[8px]',
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-7 w-7 text-xs',
}

function colorForName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

interface TechnicianAvatarProps {
  name: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

export function TechnicianAvatar({ name, size = 'sm', className }: TechnicianAvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold shrink-0',
        SIZE_CLS[size],
        colorForName(name),
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
