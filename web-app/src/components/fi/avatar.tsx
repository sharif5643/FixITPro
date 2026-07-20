import * as React from 'react'
import { cn } from '@/lib/utils'

interface FiAvatarProps {
  name?: string
  src?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  status?: 'online' | 'busy' | 'offline'
  color?: string
  className?: string
}

const sizeMap = {
  xs: { avatar: 'h-6 w-6', text: 'text-[9px]', ring: 'h-1.5 w-1.5 ring-1' },
  sm: { avatar: 'h-8 w-8', text: 'text-[10px]', ring: 'h-2 w-2 ring-1' },
  md: { avatar: 'h-9 w-9', text: 'text-xs', ring: 'h-2.5 w-2.5 ring-2' },
  lg: { avatar: 'h-11 w-11', text: 'text-sm', ring: 'h-3 w-3 ring-2' },
  xl: { avatar: 'h-14 w-14', text: 'text-base', ring: 'h-3.5 w-3.5 ring-2' },
}

const statusColors = {
  online:  'bg-emerald-500',
  busy:    'bg-amber-500',
  offline: 'bg-slate-400',
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function getAvatarColor(name?: string): string {
  const colors = [
    'from-blue-500 to-blue-600',
    'from-emerald-500 to-emerald-600',
    'from-violet-500 to-violet-600',
    'from-rose-500 to-rose-600',
    'from-amber-500 to-amber-600',
    'from-teal-500 to-teal-600',
    'from-indigo-500 to-indigo-600',
    'from-pink-500 to-pink-600',
  ]
  if (!name) return colors[0]
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}

export function FiAvatar({ name, src, size = 'md', status, className }: FiAvatarProps) {
  const s = sizeMap[size]
  const gradient = getAvatarColor(name)
  const initials = getInitials(name)

  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name ?? 'avatar'}
          className={cn(s.avatar, 'rounded-full object-cover ring-2 ring-white dark:ring-slate-900')}
        />
      ) : (
        <div className={cn(
          s.avatar,
          'rounded-full flex items-center justify-center bg-gradient-to-br text-white font-bold flex-shrink-0',
          gradient,
        )}>
          <span className={s.text}>{initials}</span>
        </div>
      )}
      {status && (
        <span className={cn(
          'absolute bottom-0 right-0 rounded-full ring-white dark:ring-slate-900',
          s.ring,
          statusColors[status],
        )} />
      )}
    </div>
  )
}
