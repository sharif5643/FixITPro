'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { formatThaiMoney } from '@/lib/utils'

interface RevenuePoint {
  date: string
  sales: number
  repairs: number
  packages: number
  total: number
}

interface RevenueBarChartProps {
  data: RevenuePoint[]
  height?: number
  shortDate: (iso: string) => string
}

const COLORS = {
  light: { sales: '#10b981', repairs: '#fb923c', packages: '#60a5fa', grid: '#e2e8f0', axis: '#94a3b8', tooltipBg: '#ffffff', tooltipBorder: '#e2e8f0', tooltipText: '#0f172a' },
  dark:  { sales: '#059669', repairs: '#f97316', packages: '#3b82f6', grid: '#1e293b', axis: '#64748b', tooltipBg: '#0f172a', tooltipBorder: '#334155', tooltipText: '#f1f5f9' },
}

function CustomTooltip({ active, payload, label, c, shortDate }: any) {
  if (!active || !payload?.length) return null
  const sales    = payload.find((p: any) => p.dataKey === 'sales')?.value ?? 0
  const repairs  = payload.find((p: any) => p.dataKey === 'repairs')?.value ?? 0
  const packages = payload.find((p: any) => p.dataKey === 'packages')?.value ?? 0
  const total = sales + repairs + packages
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ background: c.tooltipBg, borderColor: c.tooltipBorder, color: c.tooltipText }}
    >
      <p className="font-semibold mb-1">{shortDate(label)}</p>
      <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c.sales }} />ขายสินค้า: {formatThaiMoney(sales)}</p>
      <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c.repairs }} />งานซ่อม: {formatThaiMoney(repairs)}</p>
      {packages > 0 && (
        <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c.packages }} />แพ็กเกจ: {formatThaiMoney(packages)}</p>
      )}
      <p className="mt-1 pt-1 border-t font-semibold" style={{ borderColor: c.tooltipBorder }}>รวม: {formatThaiMoney(total)}</p>
    </div>
  )
}

export function RevenueBarChart({ data, height = 144, shortDate }: RevenueBarChartProps) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const c = COLORS[mounted && theme === 'dark' ? 'dark' : 'light']

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap={6} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fontSize: 10, fill: c.axis }}
          axisLine={{ stroke: c.grid }}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip c={c} shortDate={shortDate} />} cursor={{ fill: c.grid, opacity: 0.5 }} />
        <Bar dataKey="sales"    stackId="rev" fill={c.sales}    radius={[0, 0, 0, 0]} />
        <Bar dataKey="repairs"  stackId="rev" fill={c.repairs}  radius={[0, 0, 0, 0]} />
        <Bar dataKey="packages" stackId="rev" fill={c.packages} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
