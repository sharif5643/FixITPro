'use client'

import { useState, useRef, useCallback } from 'react'
import { format, subDays, startOfMonth } from 'date-fns'
import {
  Download, Upload, FileText, Users, Package, BarChart2,
  ShoppingCart, Wrench, Receipt, BadgeCheck, ScrollText,
  CheckCircle2, XCircle, AlertTriangle, Loader2, X,
  FileUp, RefreshCw, Tag, Truck,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewRow { data: string[]; valid: boolean; errors: string[] }
interface PreviewResult {
  headers: string[]
  rows: PreviewRow[]
  stats: { total: number; valid: number; invalid: number }
}
interface ImportResult {
  imported: number
  skipped:  number
  errors:   { row: number; message: string }[]
}

// ── Export config ─────────────────────────────────────────────────────────────

const EXPORT_TYPES = [
  { key: 'customers',       label: 'ลูกค้า',            icon: Users,       color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  { key: 'products',        label: 'สินค้า',             icon: Package,     color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
  { key: 'stock-movements', label: 'ความเคลื่อนไหวสต็อก', icon: BarChart2,  color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  { key: 'sales',           label: 'การขาย',             icon: ShoppingCart,color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  { key: 'repairs',         label: 'งานซ่อม',            icon: Wrench,      color: 'text-rose-600',   bg: 'bg-rose-50',   border: 'border-rose-200' },
  { key: 'expenses',        label: 'ค่าใช้จ่าย',          icon: Receipt,     color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  { key: 'warranties',      label: 'การรับประกัน',        icon: BadgeCheck,  color: 'text-teal-600',   bg: 'bg-teal-50',   border: 'border-teal-200' },
  { key: 'audit-logs',      label: 'ประวัติกิจกรรม',      icon: ScrollText,  color: 'text-slate-600 dark:text-slate-400',   bg: 'bg-slate-50',   border: 'border-slate-200 dark:border-slate-700/60' },
] as const

type ImportType = 'products' | 'customers' | 'categories' | 'suppliers'
const IMPORT_TYPES: { key: ImportType; label: string; icon: React.ElementType }[] = [
  { key: 'products',   label: 'สินค้า',       icon: Package },
  { key: 'customers',  label: 'ลูกค้า',       icon: Users },
  { key: 'categories', label: 'หมวดหมู่',     icon: Tag },
  { key: 'suppliers',  label: 'ซัพพลายเออร์', icon: Truck },
]

// ── Date preset helper ────────────────────────────────────────────────────────

type Preset = '7d' | '30d' | 'month' | 'all'
function presetDates(p: Preset) {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  if (p === '7d')    return { startDate: fmt(subDays(today, 6)), endDate: fmt(today) }
  if (p === '30d')   return { startDate: fmt(subDays(today, 29)), endDate: fmt(today) }
  if (p === 'month') return { startDate: fmt(startOfMonth(today)), endDate: fmt(today) }
  return {}
}

// ── Export section ────────────────────────────────────────────────────────────

function ExportSection() {
  const [preset, setPreset]   = useState<Preset>('all')
  const [start,  setStart]    = useState('')
  const [end,    setEnd]      = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  const getParams = () => (start || end) ? { startDate: start || undefined, endDate: end || undefined } : presetDates(preset)

  const handleExport = async (type: string) => {
    setLoading(type)
    try {
      const params = getParams()
      const res = await api.get(`/data/export/${type}`, {
        params,
        responseType: 'blob',
      })
      const url  = URL.createObjectURL(new Blob([res.data]))
      const disp = res.headers['content-disposition'] ?? ''
      const name = disp.match(/filename="?([^";\n]+)"?/)?.[1] ?? `${type}_export.csv`
      const a    = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      toast.success(`ส่งออก ${type} สำเร็จ`)
    } catch {
      toast.error('ไม่สามารถส่งออกข้อมูลได้')
    } finally {
      setLoading(null)
    }
  }

  const PRESETS: { key: Preset; label: string }[] = [
    { key: '7d', label: '7 วัน' }, { key: '30d', label: '30 วัน' },
    { key: 'month', label: 'เดือนนี้' }, { key: 'all', label: 'ทั้งหมด' },
  ]

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Download className="h-5 w-5 text-blue-500" />
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">ส่งออกข้อมูล (Export)</h2>
        <span className="text-xs text-muted-foreground ml-1">ไฟล์ CSV (เปิดได้ใน Excel)</span>
      </div>

      {/* Date filter */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPreset(p.key); setStart(''); setEnd('') }}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold border transition-all',
                (!start && !end) && preset === p.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:border-slate-400',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">กำหนดเอง:</span>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 text-sm w-36" />
          <span className="text-xs">—</span>
          <Input type="date" value={end}   onChange={(e) => setEnd(e.target.value)}   className="h-8 text-sm w-36" />
          {(start || end) && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setStart(''); setEnd('') }}>ล้าง</Button>
          )}
        </div>
      </div>

      {/* Export grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {EXPORT_TYPES.map(({ key, label, icon: Icon, color, bg, border }) => (
          <button
            key={key}
            disabled={loading === key}
            onClick={() => handleExport(key)}
            className={`flex flex-col items-center gap-2 rounded-xl border ${border} ${bg} px-4 py-4 text-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-50`}
          >
            {loading === key
              ? <Loader2 className={`h-6 w-6 animate-spin ${color}`} />
              : <Icon className={`h-6 w-6 ${color}`} />
            }
            <span className={`text-xs font-semibold ${color}`}>{label}</span>
            <span className="text-[10px] text-muted-foreground">.csv</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Import section ────────────────────────────────────────────────────────────

function ImportSection() {
  const [activeTab, setActiveTab] = useState<ImportType>('products')
  const [file,       setFile]     = useState<File | null>(null)
  const [preview,    setPreview]  = useState<PreviewResult | null>(null)
  const [result,     setResult]   = useState<ImportResult | null>(null)
  const [step,       setStep]     = useState<'idle' | 'previewing' | 'preview' | 'importing' | 'done'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setFile(null); setPreview(null); setResult(null); setStep('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleTabChange = (t: ImportType) => { setActiveTab(t); reset() }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.endsWith('.csv') && !f.type.includes('csv') && !f.type.includes('text')) {
      toast.error('รองรับเฉพาะไฟล์ CSV')
      return
    }
    setFile(f); setPreview(null); setResult(null); setStep('previewing')

    const form = new FormData()
    form.append('file', f)
    try {
      const res = await api.post(`/data/import/${activeTab}/preview`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(res.data)
      setStep('preview')
    } catch {
      toast.error('ไม่สามารถอ่านไฟล์ได้ — ตรวจสอบรูปแบบ CSV')
      setStep('idle')
    }
  }

  const handleImport = async () => {
    if (!file) return
    setStep('importing')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await api.post(`/data/import/${activeTab}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
      setStep('done')
      if (res.data.imported > 0) toast.success(`นำเข้า ${res.data.imported} รายการสำเร็จ`)
      else toast.error('ไม่มีรายการที่นำเข้าได้')
    } catch {
      toast.error('นำเข้าข้อมูลล้มเหลว')
      setStep('preview')
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get(`/data/template/${activeTab}`, { responseType: 'blob' })
      const url  = URL.createObjectURL(new Blob([res.data]))
      const disp = res.headers['content-disposition'] ?? ''
      const name = disp.match(/filename="?([^";\n]+)"?/)?.[1] ?? `${activeTab}_template.csv`
      const a    = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('ดาวน์โหลด template ไม่สำเร็จ')
    }
  }

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Upload className="h-5 w-5 text-green-500" />
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">นำเข้าข้อมูล (Import)</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {IMPORT_TYPES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-muted-foreground hover:text-slate-900 dark:text-white',
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Template download */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
        <FileText className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-800">ดาวน์โหลด Template</p>
          <p className="text-xs text-blue-600">ใช้ไฟล์ template เพื่อกรอกข้อมูลให้ถูกรูปแบบ</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-blue-300 text-blue-700 hover:bg-blue-100 gap-1.5 shrink-0"
          onClick={handleDownloadTemplate}
        >
          <Download className="h-3.5 w-3.5" />
          Template
        </Button>
      </div>

      {/* Step: idle / upload area */}
      {step === 'idle' && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700/60 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="h-10 w-10 text-slate-300 dark:text-slate-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">คลิกเพื่อเลือกไฟล์ CSV</p>
            <p className="text-xs text-muted-foreground mt-1">รองรับ .csv เท่านั้น ขนาดสูงสุด 5 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}

      {/* Step: previewing (loading) */}
      {step === 'previewing' && (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">กำลังอ่านและตรวจสอบข้อมูล...</span>
        </div>
      )}

      {/* Step: preview */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                ทั้งหมด {preview.stats.total} แถว
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              <span className="text-green-700 font-semibold">{preview.stats.valid} ถูกต้อง</span>
            </div>
            {preview.stats.invalid > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-red-600 font-semibold">{preview.stats.invalid} มีปัญหา</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{file?.name}</span>
          </div>

          {/* Preview table */}
          <div className="rounded-2xl border border-slate-100 dark:border-slate-700/60 overflow-hidden bg-white dark:bg-[#1E293B]">
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-700/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 w-10">#</th>
                    {preview.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 w-32">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className={row.valid ? '' : 'bg-red-50'}>
                      <td className="px-3 py-1.5 text-slate-400 dark:text-slate-500">{i + 2}</td>
                      {row.data.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[160px] truncate">{cell || '—'}</td>
                      ))}
                      <td className="px-3 py-1.5">
                        {row.valid ? (
                          <span className="inline-flex items-center gap-0.5 text-green-700 font-medium">
                            <CheckCircle2 className="h-3 w-3" /> ถูกต้อง
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-start gap-0.5 text-red-600 font-medium text-[10px]"
                            title={row.errors.join('\n')}
                          >
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{row.errors[0]}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 100 && (
                <p className="text-center text-xs text-muted-foreground py-2 border-t">
                  แสดง 100 แถวแรก จาก {preview.rows.length} แถว
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={reset}
            >
              <X className="h-3.5 w-3.5" />
              ยกเลิก
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={preview.stats.valid === 0}
              onClick={handleImport}
            >
              <Upload className="h-3.5 w-3.5" />
              นำเข้า {preview.stats.valid} รายการ
            </Button>
            {preview.stats.valid === 0 && (
              <p className="text-xs text-red-500">ไม่มีแถวที่ถูกต้อง — กรุณาแก้ไขไฟล์</p>
            )}
          </div>
        </div>
      )}

      {/* Step: importing */}
      {step === 'importing' && (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm">กำลังนำเข้าข้อมูล...</span>
        </div>
      )}

      {/* Step: done */}
      {step === 'done' && result && (
        <div className="space-y-4">
          {/* Result summary */}
          <div className={`rounded-xl border p-4 ${result.imported > 0 ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/60' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.imported > 0
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-red-500" />
              }
              <p className={`text-sm font-semibold ${result.imported > 0 ? 'text-green-800' : 'text-red-700'}`}>
                {result.imported > 0 ? `นำเข้าสำเร็จ ${result.imported} รายการ` : 'นำเข้าไม่สำเร็จ'}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-green-700">
                <strong>{result.imported}</strong> นำเข้าแล้ว
              </span>
              {result.skipped > 0 && (
                <span className="text-amber-700">
                  <strong>{result.skipped}</strong> ข้ามซ้ำ
                </span>
              )}
              {result.errors.length > 0 && (
                <span className="text-red-600">
                  <strong>{result.errors.length}</strong> ข้อผิดพลาด
                </span>
              )}
            </div>
          </div>

          {/* Error detail */}
          {result.errors.length > 0 && (
            <div className="rounded-2xl border border-red-200 dark:border-red-700/60 overflow-hidden bg-white dark:bg-[#1E293B]">
              <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                <p className="text-xs font-semibold text-red-700">รายการที่มีปัญหา</p>
              </div>
              <div className="divide-y max-h-48 overflow-y-auto">
                {result.errors.map((e) => (
                  <div key={e.row} className="flex items-start gap-3 px-4 py-2">
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">แถว {e.row}</span>
                    <span className="text-xs text-red-600">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={reset}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            นำเข้าไฟล์ใหม่
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DataToolsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="เครื่องมือข้อมูล"
        icon={FileText}
        subtitle="ส่งออกข้อมูลเป็น CSV และนำเข้าข้อมูลจากไฟล์ CSV"
      />

      <ExportSection />
      <ImportSection />
    </div>
  )
}
