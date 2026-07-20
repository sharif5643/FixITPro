'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Loader2, Save, Store, Receipt, DollarSign, Settings2, Bell, Image, BellRing, ChevronRight,
  MessageSquare, Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'
import { useAuthStore } from '@/store/auth.store'

// ── Schema ────────────────────────────────────────────────────────────────────

const settingsSchema = z.object({
  shopName:            z.string().min(1, 'กรุณากรอกชื่อร้าน'),
  shopSubtitle:        z.string().optional(),
  shopPhone:           z.string().optional(),
  shopAddress:         z.string().optional(),
  shopEmail:           z.string().optional(),
  taxId:               z.string().optional(),
  logoUrl:             z.string().optional(),
  receiptFooter:       z.string().optional(),
  paperWidth:          z.enum(['58mm', '80mm']),
  vatPercent:          z.coerce.number().min(0).max(100),
  defaultDeposit:      z.coerce.number().min(0),
  autoGenerateSku:     z.boolean(),
  autoGenerateBarcode: z.boolean(),
  autoPrint:           z.boolean(),
  lowStockAlert:       z.coerce.number().min(0),
  repairWarrantyText:  z.string().optional(),
  paymentQrUrl:        z.string().optional(),
  showTaxId:           z.boolean(),
  showLogo:            z.boolean(),
})
type SettingsFormData = z.infer<typeof settingsSchema>

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked, onChange, label, description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
      <div className="pr-4">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {description && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 shrink-0',
          checked ? 'bg-blue-600' : 'bg-slate-200',
        )}
      >
        <span className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )} />
      </button>
    </div>
  )
}

// ── Tab config ────────────────────────────────────────────────────────────────

const SETTINGS_TABS = [
  { id: 'shop',    label: 'ข้อมูลร้าน',    icon: Store     },
  { id: 'receipt', label: 'ใบเสร็จ',        icon: Receipt   },
  { id: 'finance', label: 'การเงิน',         icon: DollarSign },
  { id: 'system',  label: 'ระบบ',           icon: Settings2 },
  { id: 'alerts',  label: 'การแจ้งเตือน',  icon: Bell      },
] as const

type TabId = typeof SETTINGS_TABS[number]['id']

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient               = useQueryClient()
  const [logoPreview, setLogoPreview] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('shop')
  const user = useAuthStore((s) => s.user)

  const { data: settings, isLoading } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const {
    register, handleSubmit, watch, setValue, reset,
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

  const paperWidth          = watch('paperWidth')
  const autoGenerateSku    = watch('autoGenerateSku')
  const autoGenerateBarcode = watch('autoGenerateBarcode')
  const autoPrint          = watch('autoPrint')
  const showTaxId          = watch('showTaxId')
  const showLogo           = watch('showLogo')

  useEffect(() => {
    if (settings) {
      reset({
        shopName:            settings.shopName,
        shopSubtitle:        settings.shopSubtitle        ?? '',
        shopPhone:           settings.shopPhone           ?? '',
        shopAddress:         settings.shopAddress         ?? '',
        shopEmail:           settings.shopEmail           ?? '',
        taxId:               settings.taxId               ?? '',
        logoUrl:             settings.logoUrl             ?? '',
        receiptFooter:       settings.receiptFooter       ?? '',
        paperWidth:          settings.paperWidth as '58mm' | '80mm',
        vatPercent:          Number(settings.vatPercent),
        defaultDeposit:      Number(settings.defaultDeposit),
        autoGenerateSku:     settings.autoGenerateSku,
        autoGenerateBarcode: settings.autoGenerateBarcode,
        autoPrint:           settings.autoPrint,
        lowStockAlert:       settings.lowStockAlert,
        repairWarrantyText:  settings.repairWarrantyText  ?? '',
        paymentQrUrl:        settings.paymentQrUrl        ?? '',
        showTaxId:           settings.showTaxId           ?? true,
        showLogo:            settings.showLogo            ?? true,
      })
      setLogoPreview(settings.logoUrl ?? '')
    }
  }, [settings, reset])

  const saveMutation = useMutation({
    mutationFn: (data: SettingsFormData) =>
      api.patch('/settings', {
        ...data,
        shopSubtitle:       data.shopSubtitle       || null,
        shopPhone:          data.shopPhone           || null,
        shopAddress:        data.shopAddress         || null,
        shopEmail:          data.shopEmail           || null,
        taxId:              data.taxId               || null,
        logoUrl:            data.logoUrl             || null,
        receiptFooter:      data.receiptFooter       || null,
        repairWarrantyText: data.repairWarrantyText  || null,
        paymentQrUrl:       data.paymentQrUrl        || null,
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
      <div className="flex items-center justify-center h-64 gap-3 text-slate-500">
        <div className="h-6 w-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <span className="text-sm">กำลังโหลดการตั้งค่า...</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutateAsync(d))}>
      <div className="space-y-6 max-w-5xl">

        {/* ── Header ── */}
        <PageHeader
          title="ตั้งค่าระบบ"
          icon={Settings2}
          subtitle="จัดการข้อมูลร้านและการตั้งค่าทั้งหมด"
          primaryAction={
            <Button
              type="submit"
              disabled={saveMutation.isPending || !isDirty}
              className="gap-2 min-w-[120px]"
            >
              {saveMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              บันทึก
            </Button>
          }
        />

        {/* ── Tab layout ── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Sidebar tab nav */}
          <nav className="lg:w-52 shrink-0">
            <div className="lg:sticky lg:top-4">
              <div className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-none pb-1 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon
                  const active = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 text-left w-full',
                        active
                          ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)]'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700/40 hover:shadow-sm hover:text-slate-900 dark:hover:text-white',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {tab.label}
                      {active && isDirty && (
                        <span className="ml-auto h-2 w-2 rounded-full bg-white/70 shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </nav>

          {/* Content area */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* ── Tab: ข้อมูลร้าน ── */}
            {activeTab === 'shop' && (
              <SectionCard title="ข้อมูลร้านค้า" description="ชื่อร้าน ที่อยู่ และข้อมูลติดต่อ" icon={Store}>
                {/* Logo */}
                <div className="mb-5 pb-5 border-b border-slate-100">
                  <Label className="mb-2 block">โลโก้ร้าน (URL รูปภาพ)</Label>
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
                      <p className="text-xs text-slate-400">ใส่ URL รูปภาพ (png, jpg, svg)</p>
                    </div>
                    <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center shrink-0 overflow-hidden">
                      {logoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoPreview} alt="logo" className="h-full w-full object-contain" onError={() => setLogoPreview('')} />
                      ) : (
                        <Image className="h-6 w-6 text-slate-300" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>ชื่อร้าน <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="FixITPro"
                        {...register('shopName')}
                        className={errors.shopName ? 'border-red-400' : ''}
                      />
                      {errors.shopName && <p className="text-xs text-red-500">{errors.shopName.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>คำอธิบายร้าน (Subtitle)</Label>
                      <Input placeholder="ร้านซ่อมมือถือ ราคายุติธรรม" {...register('shopSubtitle')} />
                      <p className="text-xs text-slate-400">แสดงใต้ชื่อร้านในเมนูด้านข้าง</p>
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
                    <Textarea
                      placeholder="123 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110"
                      rows={2}
                      {...register('shopAddress')}
                    />
                  </div>

                  <div className="space-y-1.5 max-w-xs">
                    <Label>เลขผู้เสียภาษี (Tax ID)</Label>
                    <Input placeholder="0-0000-00000-00-0" {...register('taxId')} />
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── Tab: ใบเสร็จ ── */}
            {activeTab === 'receipt' && (
              <SectionCard title="ตั้งค่าใบเสร็จ" description="กระดาษพิมพ์ ข้อความ และการตั้งค่าการพิมพ์" icon={Receipt}>
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
                    <p className="text-xs text-slate-400">แสดงในใบเสร็จซ่อม/ส่งมอบ</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>URL QR Code ชำระเงิน (PromptPay)</Label>
                    <Input
                      placeholder="https://example.com/qr-promptpay.png"
                      {...register('paymentQrUrl')}
                    />
                    <p className="text-xs text-slate-400">แสดง QR Code ในใบเสร็จเมื่อชำระผ่านการโอนเงิน</p>
                  </div>

                  <div className="pt-1 border-t border-slate-100 space-y-0 divide-y divide-slate-100">
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
              </SectionCard>
            )}

            {/* ── Tab: การเงิน ── */}
            {activeTab === 'finance' && (
              <SectionCard title="ตั้งค่าการเงิน" description="VAT ภาษี และค่าเริ่มต้นทางการเงิน" icon={DollarSign}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <Label>VAT (%)</Label>
                    <Input type="number" min={0} max={100} step={0.5} placeholder="0" {...register('vatPercent')} />
                    <p className="text-xs text-slate-400">0 = ไม่คิด VAT · 7 = VAT 7%</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>ค่ามัดจำเริ่มต้น (฿)</Label>
                    <Input type="number" min={0} step={1} placeholder="0" {...register('defaultDeposit')} />
                    <p className="text-xs text-slate-400">ค่ามัดจำ default ในฟอร์มรับซ่อม</p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── Tab: ระบบ ── */}
            {activeTab === 'system' && (
              <SectionCard title="ตั้งค่าระบบ" description="การสร้างรหัสสินค้าและระบบอัตโนมัติ" icon={Settings2}>
                <div className="space-y-0 divide-y divide-slate-100">
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
              </SectionCard>
            )}

            {/* ── Tab: การแจ้งเตือน ── */}
            {activeTab === 'alerts' && (
              <>
                <SectionCard title="Low Stock Alert" description="ตั้งค่าเกณฑ์แจ้งเตือนสต็อกต่ำ" icon={Bell}>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>แจ้งเตือนเมื่อสต็อกต่ำกว่า (ชิ้น)</Label>
                    <Input type="number" min={0} step={1} placeholder="5" {...register('lowStockAlert')} />
                    <p className="text-xs text-slate-400">
                      สินค้าที่มีสต็อกต่ำกว่าจำนวนนี้จะแสดงในรายงาน Low Stock
                    </p>
                  </div>
                </SectionCard>

                <SectionCard title="การแจ้งเตือนอัจฉริยะ" description="ปรับแต่ง popup เสียง และช่วงเวลาการแจ้งเตือน" icon={BellRing}>
                  <Link
                    href="/settings/notifications"
                    className="flex items-center justify-between p-4 rounded-2xl border border-blue-100 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-[0_4px_8px_rgba(37,99,235,0.25)]">
                        <BellRing className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">ตั้งค่าการแจ้งเตือน</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">เสียง · ประเภทการแจ้งเตือน · ความถี่ 1–30 นาที</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-blue-400 dark:text-blue-500 shrink-0" />
                  </Link>
                </SectionCard>

                <SectionCard title="LINE Notification" description="แจ้งเตือนลูกค้าผ่าน LINE อัตโนมัติ" icon={MessageSquare}>
                  <Link
                    href="/settings/line"
                    className="flex items-center justify-between p-4 rounded-2xl border border-green-100 dark:border-green-800/40 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-green-500 flex items-center justify-center shrink-0 shadow-[0_4px_8px_rgba(34,197,94,0.25)]">
                        <MessageSquare className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-900 dark:text-green-200">ตั้งค่า LINE OA</p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Channel Access Token · Webhook URL · เหตุการณ์แจ้งเตือน</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-green-400 dark:text-green-500 shrink-0" />
                  </Link>
                </SectionCard>

                <SectionCard title="Backup & Restore" description="สำรองและกู้คืนข้อมูลระบบ" icon={Database}>
                  <Link
                    href="/settings/backup"
                    className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-700 dark:bg-slate-600 flex items-center justify-center shrink-0 shadow-[0_4px_8px_rgba(0,0,0,0.15)]">
                        <Database className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">จัดการ Backup</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Auto backup 02:00 น. ทุกวัน · ดาวน์โหลดไฟล์ · Backup ทันที</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                  </Link>
                </SectionCard>
              </>
            )}

          </div>
        </div>
      </div>
    </form>
  )
}
