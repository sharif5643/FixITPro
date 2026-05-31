'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// ── Fade + slide up for individual items ──────────────────────────────────────

interface FadeUpProps {
  children: React.ReactNode
  delay?:   number
  className?: string
}

export function FadeUp({ children, delay = 0, className }: FadeUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── Staggered list container ──────────────────────────────────────────────────

interface StaggerListProps {
  children: React.ReactNode[]
  stagger?:   number   // seconds between items
  className?: string
  itemClassName?: string
}

export function StaggerList({
  children,
  stagger     = 0.05,
  className,
  itemClassName,
}: StaggerListProps) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: i * stagger, ease: 'easeOut' }}
          className={itemClassName}
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}

// ── Fade in wrapper ───────────────────────────────────────────────────────────

export function FadeIn({
  children,
  duration  = 0.2,
  className,
}: {
  children: React.ReactNode
  duration?:  number
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// ── Slide in from right (notifications, drawers) ──────────────────────────────

export function SlideInRight({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export { AnimatePresence }
