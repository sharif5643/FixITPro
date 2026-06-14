'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Puzzle, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import api from '@/lib/api'
import type { AppModule } from '@/types'
import { cn } from '@/lib/utils'

// ── Dialogs ───────────────────────────────────────────────────────────────────

function ModuleDialog({
  open, onClose, module: mod,
}: {
  open: boolean
  onClose: () => void
  module?: AppModule
}) {
  const qc = useQueryClient()
  const isEdit = !!mod
  const [key, setKey] = useState(mod?.key ?? '')
  const [name, setName] = useState(mod?.name ?? '')
  const [description, setDescription] = useState(mod?.description ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? api.put(`/super-admin/modules/${mod!.key}`, { name, description })
        : api.post('/super-admin/modules', { key, name, description }),
    onSuccess: () => {
      toast.success(isEdit ? 'แก้ไขโมดูลสำเร็จ' : 'สร้างโมดูลสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-modules'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const valid = isEdit ? !!name.trim() : !!key.trim() && !!name.trim()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'แก้ไขโมดูล' : 'สร้างโมดูลใหม่'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {!isEdit && (
            <div className="space-y-1">
              <Label className="text-slate-300 text-xs">Module Key *</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                placeholder="เช่น line_notify"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm font-mono"
              />
              <p className="text-slate-600 text-[11px]">ใช้ตัวพิมพ์เล็ก, ขีดล่าง, ไม่มีช่องว่าง — ไม่สามารถเปลี่ยนภายหลัง</p>
            </div>
          )}
          {isEdit && (
            <div className="space-y-1">
              <Label className="text-slate-300 text-xs">Module Key</Label>
              <p className="text-sm font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded-md px-3 py-2">{mod!.key}</p>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">ชื่อโมดูล *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น งานซ่อม"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">คำอธิบาย</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="อธิบายสั้นๆ..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 resize-none h-20 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !valid}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'บันทึก' : 'สร้าง'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConfirmDialog({
  open, onClose, module: mod,
}: {
  open: boolean
  onClose: () => void
  module?: AppModule
}) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.delete(`/super-admin/modules/${mod!.key}`),
    onSuccess: () => {
      toast.success('ลบโมดูลสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-modules'] })
      qc.invalidateQueries({ queryKey: ['sa-packages'] })
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-400" />
            ลบโมดูล
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-slate-300 text-sm">
            คุณต้องการลบโมดูล <span className="font-semibold text-white">{mod?.name}</span>{' '}
            (<code className="font-mono text-xs text-red-300">{mod?.key}</code>) ใช่หรือไม่?
          </p>
          <div className="rounded-lg border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs text-red-400">
            การลบโมดูลจะลบออกจากแพ็กเกจทั้งหมดด้วย และไม่สามารถย้อนกลับได้
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">ยกเลิก</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            ลบโมดูล
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ModulesPage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editModule, setEditModule] = useState<AppModule | null>(null)
  const [deleteModule, setDeleteModule] = useState<AppModule | null>(null)

  const { data: modules, isLoading } = useQuery<AppModule[]>({
    queryKey: ['sa-modules'],
    queryFn: () => api.get('/super-admin/modules').then((r) => r.data),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ key, isActive }: { key: string; isActive: boolean }) =>
      api.put(`/super-admin/modules/${key}`, { isActive }),
    onSuccess: (_, vars) => {
      toast.success(vars.isActive ? 'เปิดใช้งานโมดูลแล้ว' : 'ปิดใช้งานโมดูลแล้ว')
      qc.invalidateQueries({ queryKey: ['sa-modules'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const activeCount = (modules ?? []).filter((m) => m.isActive).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">โมดูล</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            จัดการโมดูลทั้งหมดในระบบ — โมดูลที่ปิดจะไม่แสดงในแพ็กเกจ
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold">
            <Puzzle className="h-3.5 w-3.5" />
            {activeCount} / {modules?.length ?? 0} active
          </span>
          <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700 gap-2">
            <Plus className="h-4 w-4" />
            เพิ่มโมดูล
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : (modules ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <Puzzle className="h-10 w-10 opacity-20" />
            <p>ยังไม่มีโมดูล</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">Module Key</th>
                  <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">ชื่อ</th>
                  <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase hidden md:table-cell">คำอธิบาย</th>
                  <th className="text-left py-3 px-5 text-slate-400 font-medium text-xs uppercase">สถานะ</th>
                  <th className="py-3 px-5 w-28" />
                </tr>
              </thead>
              <tbody>
                {(modules ?? []).map((mod) => (
                  <tr key={mod.key} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-5">
                      <code className="text-xs font-mono bg-slate-800 border border-slate-700 rounded px-2 py-1 text-violet-300">
                        {mod.key}
                      </code>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-white font-medium">{mod.name}</span>
                    </td>
                    <td className="py-3.5 px-5 hidden md:table-cell">
                      <span className="text-slate-500 text-xs">{mod.description ?? '—'}</span>
                    </td>
                    <td className="py-3.5 px-5">
                      <button
                        type="button"
                        onClick={() => toggleMutation.mutate({ key: mod.key, isActive: !mod.isActive })}
                        disabled={toggleMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium disabled:opacity-40"
                      >
                        {mod.isActive ? (
                          <>
                            <ToggleRight className="h-5 w-5 text-emerald-400" />
                            <span className="text-emerald-400">Active</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-5 w-5 text-slate-600" />
                            <span className="text-slate-500">Inactive</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditModule(mod)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                          title="แก้ไข"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteModule(mod)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="ลบ"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ModuleDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editModule && (
        <ModuleDialog
          open={!!editModule}
          onClose={() => setEditModule(null)}
          module={editModule}
        />
      )}
      {deleteModule && (
        <DeleteConfirmDialog
          open={!!deleteModule}
          onClose={() => setDeleteModule(null)}
          module={deleteModule}
        />
      )}
    </div>
  )
}
