'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Loader2,
  Save,
  Store,
  Receipt,
  DollarSign,
  Settings2,
  Bell,
  Image,
  BellRing,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'
import {
  loadReminderSettings,
  saveReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from '@/lib/reminder-settings'
import { useAuthStore } from '@/store/auth.store'

const settingsSchema = z.object({
  shopName:           z.string().min(1, 'กรุณากรอกชื่อร้าน'),
  shopSubtitle:       z.string().optional(),
  shopPhone:          z.string().optional(),
  shopAddress:        z.string().optional(),
  shopEmail:          z.string().optional(),
  taxId:              z.string().optional(),
  logoUrl:            z.string().optional(),
  receiptFooter:      z.string().optional(),
  paperWidth:         z.enum(['58mm', '80mm']),
  vatPercent:         z.coerce.number().min(0).max(100),
  defaultDeposit:     z.coerce.number().min(0),
  autoGenerateSku:    z.boolean(),
  autoGenerateBarcode: z.boolean(),
  autoPrint:          z.boolean(),
  lowStockAlert:      z.coerce.number().min(0),
  repairWarrantyText: z.string().optional(),
  paymentQrUrl:       z.string().optional(),
  showTaxId:          z.boolean(),
  showLogo:           z.boolean(),
})
type SettingsFormData = z.infer<typeof settingsSchema>

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b mb-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 shrink-0">
        <Icon className="h-4.5 w-4.5 text-blue-600" style={{ width: 18, height: 18 }} />
      </div>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0',
          checked ? 'bg-blue-600' : 'bg-gray-200',
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

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [logoPreview, setLogoPreview] = useState('')
  const user = useAuthStore((s) => s.user)

  // ── Smart Reminder Settings (localStorage per-user) ──────────────────────
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({ ...DEFAULT_REMINDER_SETTINGS })
  const [reminderLoaded, setReminderLoaded] = useState(false)

  useEffect(() => {
    if (user?.id) {
      setReminderSettings(loadReminderSettings(user.id))
      setReminderLoaded(true)
    }
  }, [user?.id])

  function updateReminder<K extends keyof ReminderSettings>(key: K, val: ReminderSettings[K]) {
    if (!user?.id) return
    const next = { ...reminderSettings, [key]: val }
    setReminderSettings(next)
    saveReminderSettings(user.id, next)
    toast.success('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')
  }

  const { data: settings, isLoading } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      shopName:            'FixITPro',
      shopSubtitle:        '',
      paperWidth:          '80mm',
      vatPercent:          0,
      defaultDeposit:      0,
      autoGenerateSku:     true,
      autoGenerateBarcode: false,
      autoPrint:           false,
      lowStockAlert:       5,
      repairWarrantyText:  '',
      paymentQrUrl:        '',
      showTaxId:           true,
      showLogo:            true,
    },
  })

  const paperWidth         = watch('paperWidth')
  const autoGenerateSku    = watch('autoGenerateSku')
  const autoGenerateBarcode = watch('autoGenerateBarcode')
  const autoPrint          = watch('autoPrint')
  const showTaxId          = watch('showTaxId')
  const showLogo           = watch('showLogo')
  const logoUrl            = watch('logoUrl')

  useEffect(() => {
    if (settings) {
      reset({
        shopName:            settings.shopName,
        shopSubtitle:        settings.shopSubtitle ?? '',
        shopPhone:           settings.shopPhone ?? '',
        shopAddress:         settings.shopAddress ?? '',
        shopEmail:           settings.shopEmail ?? '',
        taxId:               settings.taxId ?? '',
        logoUrl:             settings.logoUrl ?? '',
        receiptFooter:       settings.receiptFooter ?? '',
        paperWidth:          settings.paperWidth as '58mm' | '80mm',
        vatPercent:          Number(settings.vatPercent),
        defaultDeposit:      Number(settings.defaultDeposit),
        autoGenerateSku:     settings.autoGenerateSku,
        autoGenerateBarcode: settings.autoGenerateBarcode,
        autoPrint:           settings.autoPrint,
        lowStockAlert:       settings.lowStockAlert,
        repairWarrantyText:  settings.repairWarrantyText ?? '',
        paymentQrUrl:        settings.paymentQrUrl ?? '',
        showTaxId:           settings.showTaxId ?? true,
        showLogo:            settings.showLogo ?? true,
      })
      setLogoPreview(settings.logoUrl ?? '')
    }
  }, [settings, reset])

  const saveMutation = useMutation({
    mutationFn: (data: SettingsFormData) =>
      api.patch('/settings', {
        ...data,
        shopSubtitle:        data.shopSubtitle        || null,
        shopPhone:           data.shopPhone            || null,
        shopAddress:         data.shopAddress          || null,
        shopEmail:           data.shopEmail            || null,
        taxId:               data.taxId                || null,
        logoUrl:             data.logoUrl              || null,
        receiptFooter:       data.receiptFooter        || null,
        repairWarrantyText:  data.repairWarrantyText   || null,
        paymentQrUrl:        data.paymentQrUrl         || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('บันทึกการตั้งค่าแล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลดการตั้งค่า...</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutateAsync(d))}>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ตั้งค่าระบบ</h1>
            <p className="text-sm text-muted-foreground mt-0.5">จัดการข้อมูลร้านและการตั้งค่าทั้งหมด</p>
          </div>
          <Button
            type="submit"
            disabled={saveMutation.isPending || !isDirty}
            className="gap-2 min-w-[120px]"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            บันทึก
          </Button>
        </div>

        {/* ─── 1. Shop Info ─── */}
        <div className="bg-white rounded-xl border p-6">
          <SectionHeader icon={Store} title="ข้อมูลร้านค้า" description="ชื่อ ที่อยู่ และข้อมูลติดต่อ" />

          {/* Logo */}
          <div className="mb-5 space-y-2">
            <Label>โลโก้ร้าน (URL รูปภาพ)</Label>
            <div className="flex gap-3 items-start">
              <div className="flex-1 space-y-1.5">
                <Input
                  placeholder="https://..."
                  {...register('logoUrl')}
                  onChange={(e) => {
                    setValue('logoUrl', e.target.value, { shouldDirty: true })
                    setLogoPreview(e.target.value)
                  }}
                />
                <p className="text-xs text-muted-foreground">ใส่ URL รูปภาพ (png, jpg, svg)</p>
              </div>
              <div className="h-16 w-16 rounded-xl border bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="logo" className="h-full w-full object-contain" onError={() => setLogoPreview('')} />
                ) : (
                  <Image className="h-6 w-6 text-gray-300" />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ชื่อร้าน <span className="text-red-500">*</span></Label>
                <Input placeholder="FixITPro" {...register('shopName')} className={errors.shopName ? 'border-red-400' : ''} />
                {errors.shopName && <p className="text-xs text-red-500">{errors.shopName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>คำอธิบายร้าน (Subtitle)</Label>
                <Input placeholder="ร้านซ่อมมือถือ ราคายุติธรรม" {...register('shopSubtitle')} />
                <p className="text-xs text-muted-foreground">แสดงใต้ชื่อร้านในเมนูด้านข้าง</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>เบอร์โทรร้าน</Label>
                <Input placeholder="0XX-XXX-XXXX" {...register('shopPhone')} />
              </div>
              <div className="space-y-1.5">
                <Label>อีเมลร้าน</Label>
                <Input placeholder="shop@email.com" {...register('shopEmail')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>ที่อยู่ร้าน</Label>
              <Textarea placeholder="123 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110" rows={2} {...register('shopAddress')} />
            </div>

            <div className="space-y-1.5">
              <Label>เลขผู้เสียภาษี (Tax ID)</Label>
              <Input placeholder="0-0000-00000-00-0" {...register('taxId')} />
            </div>
          </div>
        </div>

        {/* ─── 2. Receipt Settings ─── */}
        <div className="bg-white rounded-xl border p-6">
          <SectionHeader icon={Receipt} title="ตั้งค่าใบเสร็จ" description="กระดาษพิมพ์และข้อความท้ายใบเสร็จ" />

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>ขนาดกระดาษ</Label>
              <Select
                value={paperWidth}
                onValueChange={(v) => setValue('paperWidth', v as '58mm' | '80mm', { shouldDirty: true })}
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58 มม. (เครื่องพิมพ์เล็ก)</SelectItem>
                  <SelectItem value="80mm">80 มม. (เครื่องพิมพ์มาตรฐาน)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>ข้อความท้ายใบเสร็จ</Label>
              <Textarea
                placeholder="เช่น ขอบคุณที่ใช้บริการ กรุณาตรวจสอบสินค้าก่อนออกจากร้าน"
                rows={3}
                {...register('receiptFooter')}
              />
            </div>

            <div className="space-y-1.5">
              <Label>ข้อความรับประกันซ่อม</Label>
              <Textarea
                placeholder="เช่น รับประกันงานซ่อม 30 วัน นับจากวันรับเครื่อง"
                rows={2}
                {...register('repairWarrantyText')}
              />
              <p className="text-xs text-muted-foreground">แสดงในใบเสร็จซ่อม/ส่งมอบ</p>
            </div>

            <div className="space-y-1.5">
              <Label>URL QR Code ชำระเงิน (PromptPay)</Label>
              <Input
                placeholder="https://example.com/qr-promptpay.png"
                {...register('paymentQrUrl')}
              />
              <p className="text-xs text-muted-foreground">แสดง QR Code ในใบเสร็จเมื่อชำระผ่านการโอนเงิน</p>
            </div>

            <div className="space-y-0 divide-y">
              <ToggleSwitch
                checked={showLogo}
                onChange={(v) => setValue('showLogo', v, { shouldDirty: true })}
                label="แสดงโลโก้ในใบเสร็จ"
                description="พิมพ์โลโก้ร้านในหัวใบเสร็จ (ต้องตั้ง URL โลโก้)"
              />
              <ToggleSwitch
                checked={showTaxId}
                onChange={(v) => setValue('showTaxId', v, { shouldDirty: true })}
                label="แสดงเลขผู้เสียภาษีในใบเสร็จ"
                description="พิมพ์ Tax ID ในหัวใบเสร็จ (ต้องตั้งเลขผู้เสียภาษี)"
              />
              <ToggleSwitch
                checked={autoPrint}
                onChange={(v) => setValue('autoPrint', v, { shouldDirty: true })}
                label="พิมพ์ใบเสร็จอัตโนมัติ"
                description="พิมพ์ทันทีหลังชำระเงิน"
              />
            </div>
          </div>
        </div>

        {/* ─── 3. Financial ─── */}
        <div className="bg-white rounded-xl border p-6">
          <SectionHeader icon={DollarSign} title="ตั้งค่าการเงิน" description="VAT และค่าเริ่มต้น" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>VAT (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                placeholder="0"
                {...register('vatPercent')}
              />
              <p className="text-xs text-muted-foreground">0 = ไม่คิด VAT, 7 = VAT 7%</p>
            </div>
            <div className="space-y-1.5">
              <Label>ค่ามัดจำเริ่มต้น (฿)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="0"
                {...register('defaultDeposit')}
              />
              <p className="text-xs text-muted-foreground">ค่ามัดจำ default ในฟอร์มรับซ่อม</p>
            </div>
          </div>
        </div>

        {/* ─── 4. System ─── */}
        <div className="bg-white rounded-xl border p-6">
          <SectionHeader icon={Settings2} title="ตั้งค่าระบบ" description="การสร้างรหัสสินค้าและระบบอัตโนมัติ" />

          <div className="space-y-0 divide-y">
            <ToggleSwitch
              checked={autoGenerateSku}
              onChange={(v) => setValue('autoGenerateSku', v, { shouldDirty: true })}
              label="สร้าง SKU อัตโนมัติ"
              description="แสดงปุ่มสร้าง SKU ในฟอร์มสินค้า (PHONE-000001, SIM-000001 ...)"
            />
            <ToggleSwitch
              checked={autoGenerateBarcode}
              onChange={(v) => setValue('autoGenerateBarcode', v, { shouldDirty: true })}
              label="สร้าง Barcode อัตโนมัติ"
              description="สร้าง Barcode EAN-13 อัตโนมัติเมื่อเพิ่มสินค้าใหม่"
            />
          </div>
        </div>

        {/* ─── 5. Alerts ─── */}
        <div className="bg-white rounded-xl border p-6">
          <SectionHeader icon={Bell} title="การแจ้งเตือน" description="ตั้งค่า Low Stock Alert" />

          <div className="space-y-1.5 max-w-xs">
            <Label>แจ้งเตือนเมื่อสต็อกต่ำกว่า (ชิ้น)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="5"
              {...register('lowStockAlert')}
            />
            <p className="text-xs text-muted-foreground">
              สินค้าที่มีสต็อกต่ำกว่าจำนวนนี้จะแสดงในรายงาน Low Stock
            </p>
          </div>
        </div>

        {/* ─── 6. Smart Reminder ─── */}
        {reminderLoaded && (
          <div className="bg-white rounded-xl border p-6">
            <SectionHeader
              icon={BellRing}
              title="การแจ้งเตือนอัจฉริยะ"
              description="ระบบเตือนอัตโนมัติสำหรับงานค้างและการโอนสินค้า"
            />

            <div className="space-y-0 divide-y mb-5">
              <ToggleSwitch
                checked={reminderSettings.enabled}
                onChange={(v) => updateReminder('enabled', v)}
                label="เปิดใช้การแจ้งเตือนอัจฉริยะ"
                description="แสดง popup แจ้งเตือนงานที่ต้องดำเนินการ"
              />
              <ToggleSwitch
                checked={reminderSettings.repairOverdue}
                onChange={(v) => updateReminder('repairOverdue', v)}
                label="แจ้งเตือนงานซ่อมค้าง"
                description="แจ้งเมื่อมีงานซ่อมที่ค้างเกิน 7 วัน"
              />
              <ToggleSwitch
                checked={reminderSettings.transferPending}
                onChange={(v) => updateReminder('transferPending', v)}
                label="แจ้งเตือนคำขอโอนสินค้ารออนุมัติ"
                description="แจ้งเมื่อมีคำขอโอนรอการอนุมัติ"
              />
              <ToggleSwitch
                checked={reminderSettings.transferInTransit}
                onChange={(v) => updateReminder('transferInTransit', v)}
                label="แจ้งเตือนสินค้ากำลังส่งรอรับ"
                description="แจ้งเมื่อมีสินค้าที่ถูกจัดส่งมาแล้วรอรับ"
              />
              <ToggleSwitch
                checked={reminderSettings.vipRepair}
                onChange={(v) => updateReminder('vipRepair', v)}
                label="แจ้งเตือนงานซ่อมลูกค้า VIP"
                description="แจ้งเมื่อมีงานซ่อมของลูกค้าที่ติดแท็ก VIP รอดำเนินการ"
              />
              <ToggleSwitch
                checked={reminderSettings.partsRequest}
                onChange={(v) => updateReminder('partsRequest', v)}
                label="แจ้งเตือนรอชิ้นส่วน (> 24 ชม.)"
                description="แจ้งเมื่องานซ่อมอยู่ในสถานะรอชิ้นส่วนนานกว่า 24 ชั่วโมง"
              />
              <ToggleSwitch
                checked={reminderSettings.pickupWaiting}
                onChange={(v) => updateReminder('pickupWaiting', v)}
                label="แจ้งเตือนลูกค้ารอรับเครื่อง"
                description="แจ้งเมื่อซ่อมเสร็จแล้วแต่ลูกค้ายังไม่มารับ"
              />
              {(user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN') && (
                <ToggleSwitch
                  checked={reminderSettings.ownerAllBranches}
                  onChange={(v) => updateReminder('ownerAllBranches', v)}
                  label="แสดงการแจ้งเตือนทุกสาขา (เจ้าของร้าน)"
                  description="เปิด = เห็นรายการจากทุกสาขา · ปิด = เห็นเฉพาะสาขาของตนเอง"
                />
              )}
              <ToggleSwitch
                checked={reminderSettings.sound}
                onChange={(v) => updateReminder('sound', v)}
                label="แจ้งเตือนพร้อมเสียง"
                description="เล่นเสียงแจ้งเตือนเมื่อมีการแจ้งใหม่"
              />
              <ToggleSwitch
                checked={reminderSettings.sunmi}
                onChange={(v) => updateReminder('sunmi', v)}
                label="แจ้งเตือนบน SUNMI"
                description="เปิดเสียง + การสั่นสะเทือนบนอุปกรณ์ SUNMI"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">ความถี่การแจ้งเตือน</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                {([1, 5, 10] as const).map((min) => (
                  <label key={min} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="reminderInterval"
                      value={min}
                      checked={reminderSettings.intervalMinutes === min}
                      onChange={() => updateReminder('intervalMinutes', min)}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{min} นาที</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                ระบบจะตรวจสอบและแสดงการแจ้งเตือนใหม่ทุก {reminderSettings.intervalMinutes} นาที
              </p>
            </div>
          </div>
        )}

        {/* Bottom save button */}
        <div className="flex justify-end pb-6">
          <Button
            type="submit"
            disabled={saveMutation.isPending || !isDirty}
            className="gap-2 min-w-[140px]"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />กำลังบันทึก...</>
            ) : (
              <><Save className="h-4 w-4" />บันทึกการตั้งค่า</>
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
