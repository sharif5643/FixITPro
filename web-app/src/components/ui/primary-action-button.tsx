'use client'

import { cn } from '@/lib/utils'
import { Loader2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ButtonHTMLAttributes } from 'react'

interface PrimaryActionButtonProps {
  children?: React.ReactNode
  onClick?: () => void
  href?: string
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
  className?: string
  size?: 'sm' | 'md' | 'lg'
  'aria-label'?: string
}

export function PrimaryActionButton({
  children,
  onClick,
  href,
  icon: Icon,
  loading = false,
  disabled = false,
  type = 'button',
  className,
  size = 'md',
  'aria-label': ariaLabel,
}: PrimaryActionButtonProps) {
  const cls = cn(
    'inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FFC107] font-bold text-[#111]',
    'shadow-[0_4px_12px_rgba(255,193,7,0.3)] active:scale-[0.98] transition-all select-none',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
    size === 'sm' && 'h-10 px-4 text-sm',
    size === 'md' && 'h-11 px-5 text-sm',
    size === 'lg' && 'h-14 px-8 text-base',
    className,
  )

  const content = (
    <>
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        : Icon && <Icon className="h-4 w-4 shrink-0" />}
      {children}
    </>
  )

  if (href && !disabled && !loading) {
    return <Link href={href} className={cls} aria-label={ariaLabel}>{content}</Link>
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={cls} aria-label={ariaLabel}>
      {content}
    </button>
  )
}
