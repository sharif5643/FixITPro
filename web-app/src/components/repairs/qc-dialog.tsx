'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldCheck, Loader2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import api from '@/lib/api'
import type { Repair } from '@/types'

interface QcItem {
  key: keyof QcChecklist
  label: string
  description: string
}

const QC_ITEMS: QcItem[] = [
  { key: 'touchScreen', label: 'Touch Screen',     description: 'หน้าจอสัมผัสทำงานปกติ' },
  { key: 'speaker',     label: 'ลำโพง / Speaker',  description: 'เสียงออกชัดเจน ไม่แตก' },
  { key: 'microphone',  label: 'ไมค์ / Microphone', description: 'รับเสียงได้ปกติ' },
  { key: 'charging',    label: 'ชาร์จ / Charging',  description: 'ชาร์จได้ปกติ ไม่ร้อนผิดปกติ' },
  { key: 'camera',      label: 'กล้อง / Camera',    description: 'กล้องหน้าและหลังทำงานปกติ' },
  { key: 'wifi',        label: 'WiFi / Network',    description: 'WiFi และสัญญาณเชื่อมต่อได้' },
  { key: 'biometric',   label: 'Face ID / นิ้วมือ', description: 'ระบบปลดล็อคทำงานปกติ' },
]

interface QcChecklist {
  touchScreen: boolean
  speaker: boolean
  microphone: boolean
  charging: boolean
  camera: boolean
  wifi: boolean
  biometric: boolean
}

interface QcDialogProps {
  repair: Repair
  open: boolean
  onClose: () => void
}

export function QcDialog({ repair, open, onClose }: QcDialogProps) {
  const queryClient = useQueryClient()
  const [checks, setChecks] = useState<QcChecklist>({
    touchScreen: false,
    speaker: false,
    microphone: false,
    charging: false,
    camera: false,
    wifi: false,
    biometric: false,
  })
  const [note, setNote] = useState('')

  const allPassed = Object.values(checks).every(Boolean)
  const passedCount = Object.values(checks).filter(Boolean).length

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/repairs/${repair.id}/qc`, { ...checks, note: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repairs'] })
      queryClient.invalidateQueries({ queryKey: ['repair', repair.id] })
      if (allPassed) {
        toast.success('QC ผ่านแล้ว! งานซ่อมเปลี่ยนเป็น COMPLETED')
      } else {
        toast.warning('QC ไม่ผ่าน — งานซ่อมส่งกลับ IN_PROGRESS')
      }
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  function toggle(key: keyof QcChecklist) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSelectAll() {
    const newVal = !allPassed
    setChecks({
      touchScreen: newVal,
      speaker: newVal,
      microphone: newVal,
      charging: newVal,
      camera: newVal,
      wifi: newVal,
      biometric: newVal,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-500" />
            QC Checklist — {repair.ticketNumber}
          </DialogTitle>
          <DialogDescription>
            {repair.deviceBrand} {repair.deviceModel} · ตรวจสอบก่อนส่งมอบ
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Select all */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
            <span className="text-sm font-medium">
              ผ่านแล้ว {passedCount}/{QC_ITEMS.length} รายการ
            </span>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {allPassed ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
            </Button>
          </div>

          {/* Checklist */}
          <div className="divide-y dark:divide-slate-700 rounded-lg border dark:border-slate-700/60 overflow-hidden">
            {QC_ITEMS.map((item) => {
              const passed = checks[item.key]
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggle(item.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    passed
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-white dark:bg-[#1E293B] hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <div className={`flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    passed
                      ? 'border-green-500 bg-green-500'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {passed && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${passed ? 'text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-200'}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                  {passed && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">✓ ผ่าน</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="qc-note" className="text-sm">หมายเหตุ (ถ้ามี)</Label>
            <Textarea
              id="qc-note"
              placeholder="บันทึกปัญหาที่พบหรือหมายเหตุเพิ่มเติม..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {/* Result preview */}
          <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
            allPassed
              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
          }`}>
            {allPassed
              ? '✅ ผ่าน QC ทุกรายการ — จะเปลี่ยนสถานะเป็น COMPLETED'
              : `❌ ไม่ผ่าน ${QC_ITEMS.length - passedCount} รายการ — ส่งกลับ IN_PROGRESS เพื่อซ่อมต่อ`}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={mutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              ยืนยัน QC
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
