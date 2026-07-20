'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Bell, BellRing, Volume2, Settings2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import {
  loadReminderSettings,
  saveReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from '@/lib/reminder-settings'
import { playAlertSound, playTypedSound } from '@/lib/alert-sound'
import { useAuthStore } from '@/store/auth.store'

// ── Local helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }: {
  icon: React.ElementType
  title: string
  description?: string
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b mb-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 shrink-0">
        <Icon className="h-[18px] w-[18px] text-blue-600" />
      </div>
      <div>
        <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0',
          checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const user    = useAuthStore((s) => s.user)
  const [settings, setSettings] = useState<ReminderSettings>({ ...DEFAULT_REMINDER_SETTINGS })
  const [loaded, setLoaded]     = useState(false)

  useEffect(() => {
    if (user?.id) {
      setSettings(loadReminderSettings(user.id))
      setLoaded(true)
    }
  }, [user?.id])

  function update<K extends keyof ReminderSettings>(key: K, val: ReminderSettings[K]) {
    if (!user?.id) return
    const next = { ...settings, [key]: val }
    setSettings(next)
    saveReminderSettings(user.id, next)
    toast.success('บันทึกแล้ว')
  }

  function previewSound(variant: 'soft' | 'critical') {
    playAlertSound(`preview-${Date.now()}`, variant, true)
  }

  function previewTypedSound(type: string) {
    playTypedSound(type, 'INFO', 0.8)
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="การตั้งค่าการแจ้งเตือน"
        icon={Bell}
        subtitle="ปรับแต่ง popup เสียง และช่วงเวลาการแจ้งเตือน"
        breadcrumbs={[{ label: 'ตั้งค่า', href: '/settings' }, { label: 'การแจ้งเตือน' }]}
      />

      {/* Master toggle */}
      <div className="bg-white rounded-xl border p-6">
        <SectionHeader
          icon={BellRing}
          title="การแจ้งเตือนอัจฉริยะ"
          description="เปิด/ปิดระบบแจ้งเตือนทั้งหมด"
        />
        <ToggleSwitch
          checked={settings.enabled}
          onChange={v => update('enabled', v)}
          label="เปิดใช้การแจ้งเตือนอัจฉริยะ"
          description="แสดง popup แจ้งเตือนงานที่ต้องดำเนินการ"
        />
      </div>

      {/* Sound settings */}
      <div className="bg-white rounded-xl border p-6">
        <SectionHeader
          icon={Volume2}
          title="เสียงแจ้งเตือน"
          description="เปิดเสียงและทดสอบก่อนใช้งาน"
        />
        <div className="space-y-0 divide-y mb-5">
          <ToggleSwitch
            checked={settings.sound}
            onChange={v => update('sound', v)}
            label="เปิดเสียงแจ้งเตือน"
            description="เล่นเสียงเมื่อมีการแจ้งเตือนใหม่ (desktop + SUNMI)"
          />
          <ToggleSwitch
            checked={settings.sunmi}
            onChange={v => update('sunmi', v)}
            label="การสั่นสะเทือนบน SUNMI"
            description="เพิ่มการสั่นสะเทือนบนอุปกรณ์ SUNMI"
          />
        </div>

        {/* Sound preview */}
        <div className="pt-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">ทดสอบเสียง</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => previewSound('soft')}
            >
              <Volume2 className="h-3.5 w-3.5" />
              เสียงทั่วไป
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => previewSound('critical')}
            >
              <Bell className="h-3.5 w-3.5" />
              เสียงวิกฤต
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => previewTypedSound('TRANSFER_PENDING')}
            >
              โอนสินค้า
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => previewTypedSound('URGENT_REPAIR')}
            >
              งานซ่อม
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => previewTypedSound('PICKUP_WAITING')}
            >
              รอรับเครื่อง
            </Button>
          </div>
        </div>
      </div>

      {/* Alert types */}
      <div className="bg-white rounded-xl border p-6">
        <SectionHeader
          icon={Bell}
          title="ประเภทการแจ้งเตือน"
          description="เลือกว่าจะรับแจ้งเตือนประเภทใดบ้าง"
        />
        <div className="space-y-0 divide-y">
          <ToggleSwitch
            checked={settings.repairOverdue}
            onChange={v => update('repairOverdue', v)}
            label="งานซ่อมค้างเกินกำหนด"
            description="แจ้งเมื่อมีงานซ่อมที่ค้างเกิน 7 วัน"
          />
          <ToggleSwitch
            checked={settings.transferPending}
            onChange={v => update('transferPending', v)}
            label="คำขอโอนสินค้ารออนุมัติ"
            description="แจ้งเมื่อมีคำขอโอนรอการอนุมัติ"
          />
          <ToggleSwitch
            checked={settings.transferInTransit}
            onChange={v => update('transferInTransit', v)}
            label="สินค้ากำลังส่งรอรับ"
            description="แจ้งเมื่อมีสินค้าที่ถูกจัดส่งมาแล้วรอรับ"
          />
          <ToggleSwitch
            checked={settings.vipRepair}
            onChange={v => update('vipRepair', v)}
            label="งานซ่อมลูกค้า VIP"
            description="แจ้งเมื่อมีงานซ่อมของลูกค้าที่ติดแท็ก VIP รอดำเนินการ"
          />
          <ToggleSwitch
            checked={settings.partsRequest}
            onChange={v => update('partsRequest', v)}
            label="รอชิ้นส่วน (> 24 ชม.)"
            description="แจ้งเมื่องานซ่อมอยู่ในสถานะรอชิ้นส่วนนานกว่า 24 ชั่วโมง"
          />
          <ToggleSwitch
            checked={settings.pickupWaiting}
            onChange={v => update('pickupWaiting', v)}
            label="ลูกค้ารอรับเครื่อง"
            description="แจ้งเมื่อซ่อมเสร็จแล้วแต่ลูกค้ายังไม่มารับ"
          />
          {(user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN') && (
            <ToggleSwitch
              checked={settings.ownerAllBranches}
              onChange={v => update('ownerAllBranches', v)}
              label="แสดงการแจ้งเตือนทุกสาขา"
              description="เปิด = เห็นรายการจากทุกสาขา · ปิด = เห็นเฉพาะสาขาของตนเอง"
            />
          )}
        </div>
      </div>

      {/* Repeat interval */}
      <div className="bg-white rounded-xl border p-6">
        <SectionHeader
          icon={Settings2}
          title="ความถี่การตรวจสอบ"
          description="ระบบจะดึงข้อมูลใหม่ตามช่วงเวลานี้"
        />
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([1, 5, 10, 30] as const).map(min => (
              <button
                key={min}
                type="button"
                onClick={() => update('intervalMinutes', min)}
                className={[
                  'px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors',
                  settings.intervalMinutes === min
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20',
                ].join(' ')}
              >
                {min} นาที
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            ระบบจะตรวจสอบงานค้างใหม่ทุก {settings.intervalMinutes} นาที
            {settings.intervalMinutes === 1 && ' · แนะนำสำหรับงานเร่งด่วน'}
            {settings.intervalMinutes === 30 && ' · ประหยัดแบตเตอรี่และ bandwidth'}
          </p>
        </div>
      </div>
    </div>
  )
}
