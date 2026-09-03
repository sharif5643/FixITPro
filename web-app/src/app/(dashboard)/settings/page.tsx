'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  Loader2, Save, Store, Receipt, DollarSign, Settings2, Bell, Image, BellRing, ChevronRight,
  MessageSquare, Database, AlertTriangle, Trash2, Upload, X, Users, Cpu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  promptpayId:         z.string().optional(),
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
  { id: 'shop',     label: 'ข้อมูลร้าน',    icon: Store,         ownerOnly: false },
  { id: 'receipt',  label: 'ใบเสร็จ',        icon: Receipt,       ownerOnly: false },
  { id: 'finance',  label: 'การเงิน',         icon: DollarSign,    ownerOnly: false },
  { id: 'system',   label: 'ระบบ',           icon: Settings2,     ownerOnly: false },
  { id: 'hardware', label: 'ฮาร์ดแวร์',      icon: Cpu,           ownerOnly: false },
  { id: 'alerts',   label: 'การแจ้งเตือน',  icon: Bell,          ownerOnly: false },
  { id: 'danger',   label: 'รีเซ็ตข้อมูล',  icon: AlertTriangle, ownerOnly: true  },
] as const

type TabId = typeof SETTINGS_TABS[number]['id']

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient               = useQueryClient()
  const [logoPreview, setLogoPreview]       = useState('')
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading]   = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<TabId>('shop')
  const [resetDialog, setResetDialog] = useState<{ open: boolean; step: 1 | 2; input: string }>({
    open: false, step: 1, input: '',
  })
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
      promptpayId:         '',
      showTaxId:           true,
      showLogo:            true,
    },
  })

  const logoUrl             = watch('logoUrl')
  const isBase64Logo        = (logoUrl ?? '').startsWith('data:')
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
        promptpayId:         settings.promptpayId         ?? '',
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
        promptpayId:        data.promptpayId         || null,
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

  const resetMutation = useMutation({
    mutationFn: () => api.post('/settings/reset-data'),
    onSuccess: () => {
      setResetDialog({ open: false, step: 1, input: '' })
      toast.success('รีเซ็ตข้อมูลเรียบร้อยแล้ว ระบบพร้อมใช้งานใหม่')
      queryClient.invalidateQueries()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกินไป (สูงสุด 2 MB)')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setLogoUploading(true)
    setLogoUploadError(null)
    setLogoPreview('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setValue('logoUrl', dataUrl, { shouldDirty: true })
      setLogoPreview(dataUrl)
    } catch {
      toast.error('อ่านไฟล์ไม่สำเร็จ')
    } finally {
      setLogoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
                {SETTINGS_TABS.filter(t => !t.ownerOnly || user?.role === 'OWNER').map((tab) => {
                  const Icon = tab.icon
                  const active = activeTab === tab.id
                  const isDanger = tab.id === 'danger'
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 text-left w-full',
                        isDanger && 'lg:mt-3',
                        isDanger && active
                          ? 'bg-red-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.25)]'
                          : isDanger
                          ? 'text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                          : active
                          ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)]'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700/40 hover:shadow-sm hover:text-slate-900 dark:hover:text-white',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {tab.label}
                      {active && isDirty && !isDanger && (
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
                  <Label className="mb-2 block">โลโก้ร้าน</Label>
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 space-y-1.5">
                      {isBase64Logo ? (
                        <div className="flex items-center gap-2 h-10 px-3 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-600">
                          <Upload className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="flex-1 truncate text-slate-500">รูปที่อัพโหลดจากเครื่อง</span>
                          <button
                            type="button"
                            onClick={() => {
                              setValue('logoUrl', '', { shouldDirty: true })
                              setLogoPreview('')
                              setLogoUploadError(null)
                            }}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Input
                          placeholder="https://..."
                          {...register('logoUrl')}
                          onChange={(e) => {
                            setValue('logoUrl', e.target.value, { shouldDirty: true })
                            setLogoPreview(e.target.value)
                            setLogoUploadError(null)
                          }}
                        />
                      )}
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-400 flex-1">ใส่ URL รูปภาพ หรืออัพโหลดจากเครื่อง (png, jpg, webp, gif · สูงสุด 2 MB)</p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={logoUploading}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 shrink-0 transition-colors"
                        >
                          {logoUploading
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Upload className="h-3.5 w-3.5" />
                          }
                          {logoUploading ? 'กำลังอัพโหลด...' : 'อัพโหลดจากเครื่อง'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={handleLogoFileChange}
                        />
                      </div>
                    </div>
                    <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center shrink-0 overflow-hidden">
                      {logoUploadError ? (
                        <div className="flex flex-col items-center gap-0.5 p-1">
                          <AlertTriangle className="h-5 w-5 text-red-400" />
                          <span className="text-[9px] text-red-400 text-center leading-tight">โหลดไม่ได้</span>
                        </div>
                      ) : logoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={logoPreview}
                          src={logoPreview}
                          alt="logo"
                          className="h-full w-full object-contain"
                          onError={() => setLogoUploadError('โหลดรูปไม่ได้')}
                        />
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
                  <div className="space-y-2">
                    <Label>ขนาดกระดาษ</Label>
                    <div className="grid grid-cols-2 gap-3 max-w-sm">
                      {([
                        {
                          value: '58mm',
                          label: '58 มม.',
                          sub: 'เครื่องพิมพ์ขนาดเล็ก',
                          note: 'ประหยัด / กระทัดรัด',
                          barW: 58,
                        },
                        {
                          value: '80mm',
                          label: '80 มม.',
                          sub: 'เครื่องพิมพ์มาตรฐาน',
                          note: 'ชัดเจน / อ่านง่าย',
                          barW: 80,
                        },
                      ] as const).map((opt) => {
                        const active = paperWidth === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setValue('paperWidth', opt.value, { shouldDirty: true })}
                            className={cn(
                              'relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-center transition-all',
                              active
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-200 bg-white hover:border-slate-300',
                            )}
                          >
                            {/* Paper roll diagram */}
                            <div className="flex flex-col items-center gap-1">
                              {/* Roll spool */}
                              <div
                                className={cn(
                                  'rounded-sm border-2',
                                  active ? 'border-emerald-500 bg-emerald-100' : 'border-slate-300 bg-slate-100',
                                )}
                                style={{ width: opt.barW * 0.9, height: 10 }}
                              />
                              {/* Paper strip */}
                              <div
                                className={cn(
                                  'rounded-sm',
                                  active ? 'bg-emerald-200' : 'bg-slate-200',
                                )}
                                style={{ width: opt.barW * 0.9, height: 36 }}
                              />
                              {/* Width label below strip */}
                              <div className="flex w-full items-center justify-between px-0.5" style={{ width: opt.barW * 0.9 }}>
                                <div className={cn('h-2 border-l', active ? 'border-emerald-400' : 'border-slate-400')} />
                                <span className={cn('text-[10px] font-mono font-semibold', active ? 'text-emerald-600' : 'text-slate-400')}>
                                  {opt.value}
                                </span>
                                <div className={cn('h-2 border-r', active ? 'border-emerald-400' : 'border-slate-400')} />
                              </div>
                            </div>

                            <p className={cn('font-bold text-sm leading-tight', active ? 'text-emerald-700' : 'text-slate-700')}>
                              {opt.label}
                            </p>
                            <p className={cn('text-xs leading-tight', active ? 'text-emerald-600' : 'text-slate-500')}>
                              {opt.sub}
                            </p>
                            <p className={cn('text-[11px]', active ? 'text-emerald-500' : 'text-slate-400')}>
                              {opt.note}
                            </p>

                            {active && (
                              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                                ✓
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-slate-400">กระดาษทั้ง 2 ขนาดใช้ได้กับเครื่องพิมพ์ความร้อน (Thermal) — เลือกให้ตรงกับม้วนกระดาษที่ใช้จริง</p>
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
                    <Label>หมายเลข PromptPay ของร้าน</Label>
                    <Input
                      placeholder="เบอร์มือถือ เช่น 0812345678 หรือเลขบัตรประชาชน 13 หลัก"
                      {...register('promptpayId')}
                    />
                    <p className="text-xs text-slate-400">ใช้สร้าง QR Code ชำระเงินอัตโนมัติเมื่อลูกค้าเลือกโอนเงิน — ลูกค้าสแกนแล้วยอดขึ้นอัตโนมัติ</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>URL รูป QR Code (ถ้าไม่ใช้ PromptPay ID)</Label>
                    <Input
                      placeholder="https://example.com/qr-promptpay.png"
                      {...register('paymentQrUrl')}
                    />
                    <p className="text-xs text-slate-400">แสดงรูป QR สำเร็จรูปในใบเสร็จ (ถ้าตั้ง PromptPay ID ไว้แล้ว ไม่ต้องใส่)</p>
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

            {/* ── Tab: ฮาร์ดแวร์ ── */}
            {activeTab === 'hardware' && (
              <SectionCard title="ลิ้นชักเงินสด" description="ตั้งค่าการเชื่อมต่อลิ้นชักเพื่อเปิดอัตโนมัติเมื่อรับเงินสด" icon={Cpu}>
                <Link
                  href="/settings/hardware"
                  className="flex items-center justify-between p-4 rounded-2xl border border-orange-100 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 shadow-[0_4px_8px_rgba(249,115,22,0.25)]">
                      <Cpu className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">ตรวจสอบและตั้งค่าฮาร์ดแวร์</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">ลิ้นชัก USB / Bluetooth / Network · ดาวน์โหลด Agent · ทดสอบเปิดลิ้นชัก</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-orange-400 dark:text-orange-500 shrink-0" />
                </Link>
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

                <SectionCard title="ฮาร์ดแวร์" description="ลิ้นชักเงินสด · เครื่องพิมพ์ · กล้อง" icon={Cpu}>
                  <Link
                    href="/settings/hardware"
                    className="flex items-center justify-between p-4 rounded-2xl border border-orange-100 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 shadow-[0_4px_8px_rgba(249,115,22,0.25)]">
                        <Cpu className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">ตรวจสอบฮาร์ดแวร์</p>
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">ตั้งค่าลิ้นชักเงินสด · USB / Bluetooth / Network · ดาวน์โหลด Agent</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-orange-400 dark:text-orange-500 shrink-0" />
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

                <SectionCard title="พาร์ทเนอร์" description="จัดการความสัมพันธ์กับร้านซ่อมพาร์ทเนอร์" icon={Users}>
                  <Link
                    href="/settings/partners"
                    className="flex items-center justify-between p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-[0_4px_8px_rgba(79,70,229,0.25)]">
                        <Users className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">ร้านพาร์ทเนอร์</p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">ส่งงานซ่อมให้ร้านพาร์ทเนอร์ · รับงานซ่อมต่อ · จัดการความสัมพันธ์</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-indigo-400 dark:text-indigo-500 shrink-0" />
                  </Link>
                </SectionCard>
              </>
            )}

            {/* ── Tab: รีเซ็ตข้อมูล (OWNER only) ── */}
            {activeTab === 'danger' && user?.role === 'OWNER' && (
              <div className="space-y-5">
                <div className="rounded-2xl border-2 border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/10 p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0 shadow-[0_4px_8px_rgba(220,38,38,0.3)]">
                      <AlertTriangle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-red-700 dark:text-red-400">Danger Zone — รีเซ็ตข้อมูลทั้งหมด</h3>
                      <p className="text-sm text-red-600 dark:text-red-500 mt-1">
                        การดำเนินการนี้จะลบข้อมูลทั้งหมดของร้านอย่างถาวร ไม่สามารถกู้คืนได้
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 divide-y divide-slate-100 dark:divide-slate-700/60">
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">สิ่งที่จะถูกลบ</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                      {[
                        'ลูกค้าทั้งหมด','สินค้าทั้งหมด','หมวดหมู่','ซัพพลายเออร์',
                        'ประวัติการขาย','ประวัติงานซ่อม','ใบสั่งซื้อ','กะงานและค่าใช้จ่าย',
                        'สต็อกสินค้า','Serial Numbers','ลิ้นชัก Sessions','Warranties & Claims',
                        'การแจ้งเตือน','Audit Logs',
                      ].map(item => (
                        <div key={item} className="flex items-center gap-2">
                          <Trash2 className="h-3 w-3 text-red-400 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">สิ่งที่จะเก็บไว้</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                      {[
                        'บัญชีผู้ใช้งานทุกคน','การตั้งค่าร้านและใบเสร็จ',
                        'สาขา','สิทธิ์การใช้งาน','Config ลิ้นชัก',
                      ].map(item => (
                        <div key={item} className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full bg-green-400 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setResetDialog({ open: true, step: 1, input: '' })}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-[0_4px_12px_rgba(220,38,38,0.25)]"
                >
                  <Trash2 className="h-4 w-4" />
                  เริ่มต้นใหม่ — ลบข้อมูลทั้งหมด
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Reset Confirmation Dialog ── */}
      {resetDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800/60 overflow-hidden">

            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-5 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800/60">
              <div className="h-9 w-9 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-red-700 dark:text-red-400">ยืนยันการรีเซ็ตข้อมูล</h2>
                <p className="text-xs text-red-500 dark:text-red-500">ขั้นตอน {resetDialog.step} จาก 2</p>
              </div>
            </div>

            <div className="px-6 py-5">
              {resetDialog.step === 1 ? (
                <>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
                    การดำเนินการนี้จะ<strong className="text-red-600 dark:text-red-400">ลบข้อมูลทั้งหมดอย่างถาวร</strong>{' '}
                    รวมถึงสินค้า ลูกค้า งานซ่อม ประวัติการขาย และข้อมูลอื่นๆ ทั้งหมด
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-6">
                    ข้อมูลที่ลบแล้ว<strong>ไม่สามารถกู้คืนได้</strong> คุณแน่ใจหรือไม่?
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setResetDialog({ open: false, step: 1, input: '' })}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetDialog(d => ({ ...d, step: 2 }))}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                    >
                      ดำเนินการต่อ →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
                    พิมพ์ <strong className="text-red-600 dark:text-red-400 font-mono">รีเซ็ต</strong>{' '}
                    เพื่อยืนยันการลบข้อมูลทั้งหมด
                  </p>
                  <input
                    type="text"
                    autoFocus
                    placeholder='พิมพ์ "รีเซ็ต" เพื่อยืนยัน'
                    value={resetDialog.input}
                    onChange={e => setResetDialog(d => ({ ...d, input: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setResetDialog({ open: false, step: 1, input: '' })}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      disabled={resetDialog.input !== 'รีเซ็ต' || resetMutation.isPending}
                      onClick={() => resetMutation.mutate()}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                    >
                      {resetMutation.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> กำลังลบ...</>
                        : <><Trash2 className="h-4 w-4" /> ลบข้อมูลทั้งหมด</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
