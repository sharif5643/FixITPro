'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Check, Loader2, ChevronDown, ChevronUp, Save, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { AppModule, PackageWithModules } from '@/types'

const MODULE_LABEL: Record<string, string> = {
  pos:             'ขายสินค้า (POS)',
  repair:          'งานซ่อม',
  stock:           'คลังสินค้า',
  finance:         'การเงิน',
  crm:             'ลูกค้าสัมพันธ์ (CRM)',
  line_notify:     'แจ้งเตือน LINE',
  report:          'รายงาน',
  user_management: 'จัดการผู้ใช้',
}

const PLAN_ACCENT: Record<string, string> = {
  TRIAL:      'border-amber-500/40 bg-amber-500/5',
  BASIC:      'border-blue-500/40 bg-blue-500/5',
  PRO:        'border-violet-500/40 bg-violet-500/5',
  ENTERPRISE: 'border-emerald-500/40 bg-emerald-500/5',
}

const PLAN_HEADER: Record<string, string> = {
  TRIAL:      'text-amber-300',
  BASIC:      'text-blue-300',
  PRO:        'text-violet-300',
  ENTERPRISE: 'text-emerald-300',
}

// ── Edit Package Meta Dialog ──────────────────────────────────────────────────

function EditPackageDialog({
  open, onClose, pkg,
}: {
  open: boolean
  onClose: () => void
  pkg: PackageWithModules
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(pkg.name)
  const [description, setDescription] = useState(pkg.description ?? '')
  const [price, setPrice] = useState(pkg.price != null ? String(pkg.price) : '')

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/super-admin/modules/packages/${pkg.key}`, {
        name,
        description: description || null,
        price: price !== '' ? parseFloat(price) : null,
      }),
    onSuccess: () => {
      toast.success(`บันทึก ${pkg.name} สำเร็จ`)
      qc.invalidateQueries({ queryKey: ['sa-packages'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>แก้ไขแพ็กเกจ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Package Key</Label>
            <p className="text-sm font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded-md px-3 py-2">{pkg.key}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">ชื่อแพ็กเกจ *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">คำอธิบาย</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 resize-none h-16 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">ราคา (บาท / เดือน)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="bg-slate-800 border-slate-700 text-white text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name.trim()}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Package Card ──────────────────────────────────────────────────────────────

function PackageCard({
  pkg,
  allModules,
}: {
  pkg: PackageWithModules
  allModules: AppModule[]
}) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const enabledKeys = new Set(pkg.modules.map((m) => m.moduleKey))
  const [draft, setDraft] = useState<Set<string>>(new Set(enabledKeys))
  const [dirty, setDirty] = useState(false)

  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setDirty(true)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/super-admin/modules/packages/${pkg.key}/modules`, {
        moduleKeys: Array.from(draft),
      }),
    onSuccess: () => {
      toast.success(`บันทึก ${pkg.name} สำเร็จ`)
      qc.invalidateQueries({ queryKey: ['sa-packages'] })
      setDirty(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const planKey = pkg.key.toUpperCase()

  return (
    <>
      <div className={cn('rounded-2xl border p-5 flex flex-col gap-4', PLAN_ACCENT[planKey] ?? 'border-slate-800 bg-slate-900/50')}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className={cn('text-base font-bold', PLAN_HEADER[planKey] ?? 'text-white')}>
              {pkg.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-slate-500 text-xs">{draft.size} โมดูล</span>
              {pkg.price != null && (
                <span className="text-slate-400 text-xs">
                  ฿{Number(pkg.price).toLocaleString('th-TH')} / เดือน
                </span>
              )}
            </div>
            {pkg.description && (
              <p className="text-slate-500 text-xs mt-1 truncate">{pkg.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
              title="แก้ไขข้อมูลแพ็กเกจ"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {dirty && (
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-violet-600 hover:bg-violet-700 h-8 px-3"
              >
                {saveMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />
                }
              </Button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Module grid */}
        {expanded ? (
          <div className="grid grid-cols-1 gap-1.5">
            {allModules.map((mod) => {
              const on = draft.has(mod.key)
              return (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => toggle(mod.key)}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                    on
                      ? 'border-violet-500/50 bg-violet-600/10 text-violet-200'
                      : 'border-slate-700 bg-slate-800/50 text-slate-500 hover:border-slate-600 hover:text-slate-300',
                  )}
                >
                  <span>{MODULE_LABEL[mod.key] ?? mod.name}</span>
                  {on && <Check className="h-3.5 w-3.5 text-violet-400 shrink-0" />}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allModules
              .filter((m) => draft.has(m.key))
              .map((m) => (
                <span
                  key={m.key}
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
                >
                  {MODULE_LABEL[m.key] ?? m.name}
                </span>
              ))}
          </div>
        )}
      </div>

      <EditPackageDialog open={editOpen} onClose={() => setEditOpen(false)} pkg={pkg} />
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PackagesPage() {
  const { data: packages, isLoading: pkgLoading } = useQuery<PackageWithModules[]>({
    queryKey: ['sa-packages'],
    queryFn: () => api.get('/super-admin/modules/packages').then((r) => r.data),
  })

  const { data: allModules, isLoading: modLoading } = useQuery<AppModule[]>({
    queryKey: ['sa-modules'],
    queryFn: () => api.get('/super-admin/modules').then((r) => r.data),
  })

  const isLoading = pkgLoading || modLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">แพ็กเกจ</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            จัดการชื่อ, ราคา และโมดูลในแต่ละแพ็กเกจ — คลิก{' '}
            <span className="text-slate-300">ลูกศร</span> เพื่อแก้ไขโมดูล,{' '}
            <span className="text-slate-300">ดินสอ</span> เพื่อแก้ไขราคา/ชื่อ
          </p>
        </div>
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold shrink-0">
          <Package className="h-3.5 w-3.5" />
          {packages?.length ?? 0} แพ็กเกจ
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {(packages ?? []).map((pkg) => (
            <PackageCard key={pkg.key} pkg={pkg} allModules={allModules ?? []} />
          ))}
        </div>
      )}
    </div>
  )
}
