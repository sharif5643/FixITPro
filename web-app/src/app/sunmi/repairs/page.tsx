'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Search, X, ChevronRight, Printer, Banknote, Smartphone, CreditCard, Info, RefreshCw, Wrench, Package, Plus, Minus, Trash2, Camera, ChevronLeft } from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
import { useAuthStore } from '@/store/auth.store'
import {
  buildRepairDeliveryHtml, buildRepairDeliveryPreviewData, shareRepairDelivery,
  type PrintRepairDeliveryOptions,
} from '@/lib/printer'
import { pushBackHandler } from '@/lib/back-stack'
import { formatThaiMoney, getAssetUrl } from '@/lib/utils'
import api from '@/lib/api'
import type { Repair, RepairStatus, ShopSettings, PaymentMethod } from '@/types'

// ── constants ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED:         'รับงาน',
  DIAGNOSING:       'ตรวจสอบ',
  WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED:         'อนุมัติ',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  COMPLETED:        'ซ่อมเสร็จ',
  DELIVERED:        'ส่งคืน',
  CANCELLED:        'ยกเลิก',
}

const STATUS_COLOR: Record<RepairStatus, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED:         'bg-teal-100 text-teal-700',
  WAITING_PARTS:    'bg-orange-100 text-orange-700',
  IN_PROGRESS:      'bg-purple-100 text-purple-700',
  COMPLETED:        'bg-green-100 text-green-700',
  DELIVERED:        'bg-slate-100 text-slate-500',
  CANCELLED:        'bg-red-100 text-red-500',
}

const NEXT_STATUS: Partial<Record<RepairStatus, RepairStatus>> = {
  RECEIVED:         'IN_PROGRESS',
  DIAGNOSING:       'IN_PROGRESS',
  WAITING_APPROVAL: 'APPROVED',
  APPROVED:         'IN_PROGRESS',
  WAITING_PARTS:    'IN_PROGRESS',
  IN_PROGRESS:      'COMPLETED',
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { value: 'CASH',     label: 'เงินสด',   icon: Banknote },
  { value: 'TRANSFER', label: 'โอนเงิน',  icon: Smartphone },
  { value: 'CARD',     label: 'บัตร',      icon: CreditCard },
]

// ── Status transition rules ────────────────────────────────────────────────────
// Mirrors backend enforcement: forward-only, CANCELLED allowed from any non-terminal status,
// DELIVERED is fully locked and must go through /repairs/:id/payment.

const STATUS_ORDER: RepairStatus[] = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED',
  'WAITING_PARTS', 'IN_PROGRESS', 'COMPLETED',
]

function canTransitionStatus(from: RepairStatus, to: RepairStatus): boolean {
  if (from === 'DELIVERED' || from === 'CANCELLED') return false
  if (to === 'DELIVERED') return false
  if (to === 'CANCELLED') return true
  const fromIdx = STATUS_ORDER.indexOf(from)
  const toIdx   = STATUS_ORDER.indexOf(to)
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx
}

type TabKey = 'ALL' | 'NEW' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED'

const TABS: { key: TabKey; label: string; statuses: RepairStatus[] }[] = [
  { key: 'ALL',          label: 'ทั้งหมด',    statuses: ['RECEIVED','DIAGNOSING','WAITING_APPROVAL','APPROVED','WAITING_PARTS','IN_PROGRESS','COMPLETED','CANCELLED'] },
  { key: 'NEW',          label: 'ใหม่',        statuses: ['RECEIVED','DIAGNOSING','WAITING_APPROVAL','APPROVED'] },
  { key: 'IN_PROGRESS',  label: 'กำลังซ่อม',  statuses: ['IN_PROGRESS'] },
  { key: 'WAITING_PARTS',label: 'รออะไหล่',   statuses: ['WAITING_PARTS'] },
  { key: 'COMPLETED',    label: 'เสร็จแล้ว',  statuses: ['COMPLETED'] },
  { key: 'DELIVERED',    label: 'ส่งคืนแล้ว', statuses: ['DELIVERED'] },
  { key: 'CANCELLED',    label: 'ยกเลิก',      statuses: ['CANCELLED'] },
]

// ── Action panel ───────────────────────────────────────────────────────────────

type PanelTab = 'info' | 'update' | 'deliver' | 'addpay' | 'parts'

interface ProductResult {
  id: string
  name: string
  sku: string
  stock: number
  costPrice: number | string
  price: number | string
}

interface ActionPanelProps {
  repair: Repair
  settings?: ShopSettings
  onClose: () => void
  onMutated: () => void
  onDelivered: (opts: PrintRepairDeliveryOptions) => void
}

function ActionPanel({ repair, settings, onClose, onMutated, onDelivered }: ActionPanelProps) {
  useEffect(() => pushBackHandler(onClose), [onClose])

  const [panelTab, setPanelTab]         = useState<PanelTab>('info')
  const [previewImg, setPreviewImg]     = useState<string | null>(null)
  const [previewIdx, setPreviewIdx]     = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [finalCost, setFinalCost]         = useState(String(repair.estimateCost ?? 0))
  const [amountPaid, setAmountPaid]       = useState('')
  const [deliveryPreview, setDeliveryPreview] = useState<PrintRepairDeliveryOptions | null>(null)
  const [addPayAmount, setAddPayAmount]   = useState('')
  const [addPayMethod, setAddPayMethod]   = useState<PaymentMethod>('CASH')
  const [addPayNote, setAddPayNote]       = useState('')
  const [partsSearch, setPartsSearch]     = useState('')
  const [partsQty, setPartsQty]           = useState<Record<string, number>>({})

  const qc = useQueryClient()

  const finalNum      = Number(finalCost) || 0
  const deposit       = repair.deposit ?? 0
  const remaining     = Math.max(0, finalNum - deposit)
  const paidNum       = Number(amountPaid) || 0
  const change        = Math.max(0, paidNum - remaining)
  const effectivePaid = paymentMethod === 'CASH' ? paidNum : remaining
  const nextStatus    = NEXT_STATUS[repair.status]

  const { data: currentShift } = useQuery<{ id: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn:  async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  const { data: repairDetail } = useQuery<Repair>({
    queryKey: ['repair-detail', repair.id],
    queryFn: async () => (await api.get(`/repairs/${repair.id}`)).data,
    staleTime: 0,
  })

  const { data: productResults = [] } = useQuery<ProductResult[]>({
    queryKey: ['products-search', partsSearch],
    queryFn: async () => {
      if (!partsSearch.trim()) return []
      return (await api.get('/products', { params: { search: partsSearch } })).data
    },
    enabled: partsSearch.trim().length > 0,
    staleTime: 30_000,
  })

  const addPartMutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      api.post(`/repairs/${repair.id}/parts`, { productId, quantity }),
    onSuccess: () => {
      toast.success('เพิ่มอะไหล่สำเร็จ')
      qc.invalidateQueries({ queryKey: ['repair-detail', repair.id] })
      setPartsSearch('')
      setPartsQty({})
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const removePartMutation = useMutation({
    mutationFn: (partId: string) => api.delete(`/repairs/${repair.id}/parts/${partId}`),
    onSuccess: () => {
      toast.success('ลบอะไหล่สำเร็จ')
      qc.invalidateQueries({ queryKey: ['repair-detail', repair.id] })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const currentParts = repairDetail?.parts ?? repair.parts ?? []
  const partsTotal   = currentParts.reduce((sum, p) => sum + p.quantity * Number(p.price), 0)
  const finalCostNum = Number(repair.finalCost ?? repair.estimateCost ?? 0)
  const canModifyParts = !['COMPLETED', 'DELIVERED'].includes(repair.status)

  const statusMutation = useMutation({
    mutationFn: (status: RepairStatus) => api.patch(`/repairs/${repair.id}`, { status }),
    onSuccess: () => { toast.success('อัพเดทสถานะสำเร็จ'); onMutated(); onClose() },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const deliverMutation = useMutation({
    mutationFn: () =>
      api.post(`/repairs/${repair.id}/payment`, {
        paymentMethod,
        finalCost: finalNum,
        amountPaid: effectivePaid,
      }),
    onSuccess: () => {
      toast.success('ส่งมอบและรับชำระสำเร็จ')
      const deliverDate = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })
      onDelivered({
        shopName:      settings?.shopName ?? 'FixITPro',
        shopPhone:     settings?.shopPhone ?? undefined,
        ticketNumber:  repair.ticketNumber,
        date:          deliverDate,
        customerName:  repair.customer?.name ?? '-',
        customerPhone: repair.customer?.phone ?? undefined,
        deviceBrand:   repair.deviceBrand,
        deviceModel:   repair.deviceModel,
        issue:         repair.issue,
        finalCost:          finalNum,
        deposit,
        remaining,
        paymentMethod,
        amountPaid:         effectivePaid,
        change:             Math.max(0, effectivePaid - remaining),
        footer:             settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
        repairWarrantyText: settings?.repairWarrantyText ?? undefined,
        taxId:              settings?.taxId ?? undefined,
        showTaxId:          settings?.showTaxId ?? true,
        paymentQrUrl:       settings?.paymentQrUrl ?? undefined,
        showLogo:           settings?.showLogo ?? true,
        logoUrl:            settings?.logoUrl ?? undefined,
      })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  function buildReprintOpts(): PrintRepairDeliveryOptions {
    const fc = Number(repair.finalCost ?? repair.estimateCost ?? 0)
    const dep = repair.deposit ?? 0
    return {
      shopName:      settings?.shopName ?? 'FixITPro',
      shopPhone:     settings?.shopPhone ?? undefined,
      ticketNumber:  repair.ticketNumber,
      date:          repair.deliveredAt
        ? format(new Date(repair.deliveredAt), 'dd/MM/yyyy HH:mm', { locale: th })
        : format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th }),
      customerName:  repair.customer?.name ?? '-',
      customerPhone: repair.customer?.phone ?? undefined,
      deviceBrand:   repair.deviceBrand,
      deviceModel:   repair.deviceModel,
      issue:         repair.issue,
      finalCost:          fc,
      deposit:            dep,
      remaining:          Math.max(0, fc - dep),
      paymentMethod:      repair.paymentMethod ?? 'CASH',
      amountPaid:         repair.paidAmount ?? 0,
      change:             Math.max(0, (repair.paidAmount ?? 0) - Math.max(0, fc - dep)),
      footer:             settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
      repairWarrantyText: settings?.repairWarrantyText ?? undefined,
      taxId:              settings?.taxId ?? undefined,
      showTaxId:          settings?.showTaxId ?? true,
      paymentQrUrl:       settings?.paymentQrUrl ?? undefined,
      showLogo:           settings?.showLogo ?? true,
      logoUrl:            settings?.logoUrl ?? undefined,
    }
  }

  const addPayMutation = useMutation({
    mutationFn: () =>
      api.post(`/repairs/${repair.id}/additional-payment`, {
        amount: Number(addPayAmount),
        paymentMethod: addPayMethod,
        note: addPayNote || undefined,
      }),
    onSuccess: () => {
      toast.success(`รับชำระเพิ่มเติมสำเร็จ ${formatThaiMoney(Number(addPayAmount))}`)
      setAddPayAmount('')
      setAddPayNote('')
      onMutated()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const isPending = statusMutation.isPending || deliverMutation.isPending

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-300" />
          </div>

          {/* Header */}
          <div className="px-4 pb-2 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono font-bold text-blue-700">{repair.ticketNumber}</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{repair.deviceBrand} {repair.deviceModel}</p>
                {repair.customer && (
                  <p className="text-sm text-slate-500">
                    {repair.customer.name}{repair.customer.phone ? ` · ${repair.customer.phone}` : ''}
                  </p>
                )}
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${STATUS_COLOR[repair.status]}`}>
                {STATUS_LABEL[repair.status]}
              </span>
            </div>
          </div>

          {/* Panel tabs */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-slate-100 shrink-0 px-4 gap-0">
            {(['info', 'update', 'deliver', 'addpay', 'parts'] as PanelTab[]).map((t) => {
              const labels: Record<PanelTab, string> = {
                info: 'ข้อมูล', update: 'อัพเดท', deliver: 'ส่งมอบ',
                addpay: 'รับเงิน+', parts: 'อะไหล่',
              }
              const deliverDisabled = t === 'deliver' && repair.status !== 'COMPLETED' && repair.status !== 'DELIVERED'
              const addpayDisabled = t === 'addpay' && repair.status !== 'DELIVERED'
              const disabled = deliverDisabled || addpayDisabled
              return (
                <button
                  key={t}
                  onClick={() => !disabled && setPanelTab(t)}
                  disabled={disabled}
                  className={`flex-none px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    panelTab === t
                      ? 'border-blue-600 text-blue-700'
                      : disabled
                      ? 'border-transparent text-slate-300'
                      : 'border-transparent text-slate-500'
                  }`}
                >
                  {labels[t]}
                  {t === 'parts' && currentParts.length > 0 && (
                    <span className="ml-1 text-[10px] font-bold text-blue-600">{currentParts.length}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4 space-y-4">

            {/* INFO tab */}
            {panelTab === 'info' && (
              <div className="space-y-3">
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
                  {[
                    ['รับงาน', format(new Date(repair.receivedAt), 'dd/MM/yyyy HH:mm', { locale: th })],
                    ['อาการ', repair.issue],
                    ['มัดจำ', `${formatThaiMoney(repair.deposit ?? 0)}`],
                    ...(repair.estimateCost ? [['ประมาณการ', formatThaiMoney(Number(repair.estimateCost))]] : []),
                    ...(repair.note ? [['หมายเหตุ', repair.note]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <span className="text-slate-400 w-20 shrink-0">{k}</span>
                      <span className="text-slate-800 flex-1">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Repair photos */}
                {(() => {
                  const images = repairDetail?.images ?? repair.images ?? []
                  return (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                        <Camera className="h-3.5 w-3.5" />
                        รูปถ่ายเครื่อง
                        {images.length > 0 && <span className="text-blue-500">({images.length} รูป)</span>}
                      </p>
                      {images.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                          {images.map((img, idx) => (
                            <button
                              key={img.id}
                              onClick={() => { setPreviewIdx(idx); setPreviewImg(getAssetUrl(img.url)) }}
                              className="aspect-square overflow-hidden rounded-xl bg-slate-200 active:opacity-70 transition-opacity"
                            >
                              <img
                                src={getAssetUrl(img.url)}
                                alt={`รูปที่ ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">ยังไม่มีรูปถ่าย</p>
                      )}
                    </div>
                  )
                })()}

                {repair.status === 'DELIVERED' && repair.paymentStatus === 'PAID' && (
                  <button
                    onClick={() => setDeliveryPreview(buildReprintOpts())}
                    className="w-full h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium flex items-center justify-center gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    พิมพ์ใบเสร็จซ้ำ
                  </button>
                )}
              </div>
            )}

            {/* UPDATE tab */}
            {panelTab === 'update' && (
              <div className="space-y-3">
                {nextStatus && repair.status !== 'COMPLETED' ? (
                  <button
                    onClick={() => statusMutation.mutate(nextStatus)}
                    disabled={isPending}
                    className="w-full h-14 rounded-2xl bg-slate-800 text-white font-bold text-base active:bg-slate-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {statusMutation.isPending
                      ? <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
                      : <><Wrench className="h-5 w-5" />เปลี่ยนเป็น: {STATUS_LABEL[nextStatus]}</>}
                  </button>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">
                    {repair.status === 'COMPLETED' ? 'ซ่อมเสร็จแล้ว — ไปที่แท็บ "ส่งมอบ"' : 'ไม่มีสถานะถัดไป'}
                  </p>
                )}

                {/* All status options */}
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-medium">เปลี่ยนสถานะเป็น:</p>
                  {(['DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'WAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as RepairStatus[]).map((s) => {
                    const isCurrent = repair.status === s
                    const isBlocked = !canTransitionStatus(repair.status, s)
                    return (
                      <button
                        key={s}
                        onClick={() => statusMutation.mutate(s)}
                        disabled={isPending || isCurrent || isBlocked}
                        className={`w-full h-11 rounded-xl border flex items-center px-4 gap-3 text-sm font-medium transition-colors ${
                          isCurrent
                            ? 'border-blue-300 bg-blue-50 text-blue-700 cursor-default'
                            : isBlocked
                            ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                            : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[s].replace('text-', 'bg-').split(' ')[0]}`} />
                        {STATUS_LABEL[s]}
                        {isCurrent && <span className="ml-auto text-xs text-blue-500">ปัจจุบัน</span>}
                        {isBlocked && !isCurrent && <span className="ml-auto text-xs text-slate-300">ไม่อนุญาต</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* DELIVER tab */}
            {panelTab === 'deliver' && repair.status === 'COMPLETED' && (
              <div className="space-y-4">
                {/* Shift warning */}
                {currentShift === null && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm text-amber-800 font-semibold">
                    ยังไม่ได้เปิดกะ — ไม่สามารถรับชำระได้
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-sm text-slate-600">ค่าซ่อม (บาท)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={finalCost}
                    onChange={(e) => setFinalCost(e.target.value)}
                    className="w-full h-14 px-4 border border-slate-200 rounded-xl text-2xl font-bold bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1.5">
                  <div className="flex justify-between text-slate-500">
                    <span>ค่าซ่อม</span><span>{formatThaiMoney(finalNum)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>มัดจำ</span><span>-{formatThaiMoney(deposit)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t pt-1">
                    <span>ยอดชำระ</span>
                    <span className="text-green-700">{formatThaiMoney(remaining)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setPaymentMethod(value)}
                      className={`flex flex-col items-center py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                        paymentMethod === value
                          ? 'border-green-600 bg-green-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <Icon className="h-5 w-5 mb-1" />
                      {label}
                    </button>
                  ))}
                </div>

                {paymentMethod === 'CASH' && (
                  <div className="space-y-1">
                    <label className="text-sm text-slate-600">รับเงินมา (บาท)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder={String(remaining)}
                      className="w-full h-14 px-4 border border-slate-200 rounded-xl text-2xl font-bold bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {change > 0 && (
                      <p className="text-sm font-bold text-green-700 text-right">เงินทอน: {formatThaiMoney(change)}</p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => deliverMutation.mutate()}
                  disabled={isPending || currentShift === null || (paymentMethod === 'CASH' && paidNum < remaining)}
                  className="w-full h-16 rounded-2xl bg-green-600 text-white text-xl font-bold active:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {deliverMutation.isPending
                    ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
                    : 'ส่งมอบ + ดูใบเสร็จ'}
                </button>
              </div>
            )}

            {panelTab === 'deliver' && repair.status === 'DELIVERED' && (
              <div className="text-center py-8 space-y-3">
                <p className="text-green-700 font-bold text-lg">ส่งมอบแล้ว</p>
                <p className="text-slate-500 text-sm">ค่าซ่อม: {formatThaiMoney(Number(repair.finalCost ?? 0))}</p>
                <button
                  onClick={() => setDeliveryPreview(buildReprintOpts())}
                  className="flex items-center justify-center gap-2 mx-auto px-6 h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium"
                >
                  <Printer className="h-4 w-4" />
                  พิมพ์ใบเสร็จซ้ำ
                </button>
              </div>
            )}

            {/* PARTS tab */}
            {panelTab === 'parts' && (
              <div className="space-y-4">
                {/* Current parts */}
                {currentParts.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">อะไหล่ที่ใช้</p>
                    {currentParts.map((part) => (
                      <div key={part.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{part.product.name}</p>
                          <p className="text-xs text-slate-400">
                            {part.quantity} ชิ้น × {formatThaiMoney(Number(part.price))}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-slate-700 tabular-nums shrink-0">
                          {formatThaiMoney(part.quantity * Number(part.price))}
                        </p>
                        {canModifyParts && (
                          <button
                            onClick={() => removePartMutation.mutate(part.id)}
                            disabled={removePartMutation.isPending}
                            className="w-8 h-8 flex items-center justify-center text-red-400 active:text-red-600 shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {/* Cost summary */}
                    <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">ต้นทุนอะไหล่</span>
                        <span className="font-bold text-slate-700 tabular-nums">{formatThaiMoney(partsTotal)}</span>
                      </div>
                      {finalCostNum > 0 && (
                        <div className="flex justify-between border-t border-slate-200 pt-1.5">
                          <span className="text-slate-500">กำไรประมาณ</span>
                          <span className={`font-bold tabular-nums ${finalCostNum - partsTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {formatThaiMoney(finalCostNum - partsTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  !canModifyParts && (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                      <Package className="h-10 w-10 mb-2 opacity-20" />
                      <p className="text-sm">ไม่มีอะไหล่</p>
                    </div>
                  )
                )}

                {/* Add parts (only when not COMPLETED/DELIVERED) */}
                {canModifyParts && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">เพิ่มอะไหล่</p>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={partsSearch}
                        onChange={(e) => setPartsSearch(e.target.value)}
                        placeholder="ค้นชื่อ / SKU / บาร์โค้ด"
                        className="w-full h-11 pl-9 pr-9 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {partsSearch && (
                        <button onClick={() => setPartsSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {partsSearch.trim() && productResults.length === 0 && (
                      <p className="text-center text-sm text-slate-400 py-2">ไม่พบสินค้า</p>
                    )}

                    {productResults.slice(0, 8).map((product) => {
                      const qty = partsQty[product.id] ?? 1
                      return (
                        <div key={product.id} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 space-y-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{product.name}</p>
                            <p className="text-xs text-slate-400">
                              {product.sku} · คงเหลือ <span className={product.stock > 0 ? 'text-slate-500' : 'text-red-500'}>{product.stock}</span>
                              {' · '}ทุน {formatThaiMoney(Number(product.costPrice))}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setPartsQty((prev) => ({ ...prev, [product.id]: Math.max(1, (prev[product.id] ?? 1) - 1) }))}
                              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-100"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
                            <button
                              onClick={() => setPartsQty((prev) => ({ ...prev, [product.id]: Math.min(product.stock, (prev[product.id] ?? 1) + 1) }))}
                              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-100"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => addPartMutation.mutate({ productId: product.id, quantity: qty })}
                              disabled={product.stock <= 0 || addPartMutation.isPending}
                              className="flex-1 h-8 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 active:bg-blue-700 flex items-center justify-center gap-1"
                            >
                              {addPartMutation.isPending
                                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                : <><Plus className="h-3.5 w-3.5" />เพิ่ม</>}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ADDITIONAL PAYMENT tab */}
            {panelTab === 'addpay' && repair.status === 'DELIVERED' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                  <p className="font-semibold">รับชำระเงินเพิ่มเติม</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    ค่าซ่อมรวม: {formatThaiMoney(Number(repair.finalCost ?? 0))} · รับแล้ว: {formatThaiMoney(Number(repair.paidAmount ?? 0))}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-slate-600">ยอดรับเพิ่ม (บาท)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={addPayAmount}
                    onChange={(e) => setAddPayAmount(e.target.value)}
                    placeholder="0"
                    className="w-full h-14 px-4 border border-slate-200 rounded-xl text-2xl font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setAddPayMethod(value)}
                      className={`flex flex-col items-center py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                        addPayMethod === value
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <Icon className="h-5 w-5 mb-1" />
                      {label}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-slate-600">หมายเหตุ (ไม่บังคับ)</label>
                  <input
                    type="text"
                    value={addPayNote}
                    onChange={(e) => setAddPayNote(e.target.value)}
                    placeholder="เช่น งวดที่ 2"
                    className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none"
                  />
                </div>

                <button
                  onClick={() => addPayMutation.mutate()}
                  disabled={!Number(addPayAmount) || Number(addPayAmount) <= 0 || addPayMutation.isPending}
                  className="w-full h-14 rounded-2xl bg-blue-600 text-white text-lg font-bold active:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {addPayMutation.isPending
                    ? <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
                    : 'บันทึกการรับเงิน'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {deliveryPreview && (
        <PrinterFlowSheet
          receiptHtml={buildRepairDeliveryHtml(deliveryPreview)}
          jobName={`ใบเสร็จซ่อม #${deliveryPreview.ticketNumber}`}
          previewData={buildRepairDeliveryPreviewData(deliveryPreview)}
          onShare={async () => shareRepairDelivery(deliveryPreview)}
          onClose={() => setDeliveryPreview(null)}
          successNavItems={[
            { label: 'ดูรายการซ่อมทั้งหมด', href: '/sunmi/repairs' },
            { label: 'กลับหน้าหลัก',         href: '/sunmi' },
          ]}
        />
      )}

      {/* Fullscreen photo preview */}
      {previewImg && (() => {
        const images = repairDetail?.images ?? repair.images ?? []
        return (
          <div className="fixed inset-0 z-[70] bg-black flex flex-col">
            <div className="flex items-center justify-between px-4 pt-10 pb-2 shrink-0">
              <button
                onClick={() => setPreviewImg(null)}
                className="flex items-center gap-1.5 text-white/70 active:text-white"
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="text-sm">กลับ</span>
              </button>
              <span className="text-white/50 text-sm">{previewIdx + 1} / {images.length}</span>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden px-4">
              <img
                src={previewImg}
                alt={`รูปที่ ${previewIdx + 1}`}
                className="max-w-full max-h-full object-contain rounded-2xl"
              />
            </div>
            {images.length > 1 && (
              <div className="flex justify-center gap-4 py-6 shrink-0">
                <button
                  onClick={() => {
                    const idx = (previewIdx - 1 + images.length) % images.length
                    setPreviewIdx(idx)
                    setPreviewImg(getAssetUrl(images[idx].url))
                  }}
                  className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
                >
                  <ChevronLeft className="h-6 w-6 text-white" />
                </button>
                <button
                  onClick={() => {
                    const idx = (previewIdx + 1) % images.length
                    setPreviewIdx(idx)
                    setPreviewImg(getAssetUrl(images[idx].url))
                  }}
                  className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
                >
                  <ChevronRight className="h-6 w-6 text-white" />
                </button>
              </div>
            )}
            <div className="flex justify-center gap-1.5 pb-8 shrink-0">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setPreviewIdx(i); setPreviewImg(getAssetUrl(images[i].url)) }}
                  className={`w-2 h-2 rounded-full transition-colors ${i === previewIdx ? 'bg-white' : 'bg-white/30'}`}
                />
              ))}
            </div>
          </div>
        )
      })()}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SunmiRepairsPage() {
  const queryClient             = useQueryClient()
  const [search, setSearch]     = useState('')
  const [activeTab, setTab]     = useState<TabKey>('ALL')
  const [selected, setSelected] = useState<Repair | null>(null)
  const [deliveryPreview, setDeliveryPreview] = useState<PrintRepairDeliveryOptions | null>(null)

  const { data: repairs = [], isLoading, refetch, isRefetching } = useQuery<Repair[]>({
    queryKey: ['repairs'],
    queryFn:  async () => (await api.get('/repairs')).data,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey:  ['settings'],
    queryFn:   async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const tabStatuses = TABS.find((t) => t.key === activeTab)?.statuses ?? []

  const filtered = useMemo(() => {
    let list = repairs.filter((r) => tabStatuses.includes(r.status))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.ticketNumber.toLowerCase().includes(q) ||
          (r.customer?.name?.toLowerCase().includes(q) ?? false) ||
          (r.customer?.phone?.toLowerCase().includes(q) ?? false) ||
          r.deviceBrand.toLowerCase().includes(q) ||
          r.deviceModel.toLowerCase().includes(q),
      )
    }
    return list
  }, [repairs, tabStatuses, search])

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {} as any
    for (const tab of TABS) {
      counts[tab.key] = repairs.filter((r) => tab.statuses.includes(r.status)).length
    }
    return counts
  }, [repairs])

  return (
    <>
      <SunmiShell
        title="งานซ่อม"
        rightContent={
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-10 w-10 flex items-center justify-center text-slate-300 active:text-white"
          >
            <RefreshCw className={`h-5 w-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        }
        aboveScroll={
          <div className="bg-white border-b border-slate-100">
            {/* Tab strip */}
            <div className="flex overflow-x-auto scrollbar-none px-3 pt-2 gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTab(tab.key)}
                  className={`flex-none px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {tab.label}
                  {tabCounts[tab.key] > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {tabCounts[tab.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative px-3 pb-2 pt-2">
              <Search className="absolute left-6 top-1/2 -translate-y-0.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ, เบอร์, เลขงาน..."
                className="w-full h-10 pl-9 pr-9 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-6 top-1/2 -translate-y-0.5 text-slate-400">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="p-3 space-y-2 pb-8">
          {/* Count */}
          <p className="text-xs text-slate-400 font-medium px-1">{filtered.length} งาน</p>

          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-slate-400">
              <Wrench className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-base font-medium">ไม่มีงานซ่อม</p>
            </div>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="w-full bg-white rounded-2xl p-4 text-left active:scale-[0.98] transition-transform shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold text-blue-700">{r.ticketNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                      {(r._count?.images ?? 0) > 0 && (
                        <Camera className="h-3 w-3 text-slate-400 shrink-0" />
                      )}
                    </div>
                    <p className="font-bold text-slate-900">{r.deviceBrand} {r.deviceModel}</p>
                    {r.customer && (
                      <p className="text-sm text-slate-500 truncate">
                        {r.customer.name}{r.customer.phone ? ` · ${r.customer.phone}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{r.issue}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ChevronRight className="h-5 w-5 text-slate-300" />
                    <span className="text-xs text-slate-400">
                      {format(new Date(r.receivedAt), 'dd/MM', { locale: th })}
                    </span>
                    {r.estimateCost && (
                      <span className="text-sm font-bold text-slate-600">{formatThaiMoney(Number(r.estimateCost))}</span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </SunmiShell>

      {selected && (
        <ActionPanel
          repair={selected}
          settings={settings}
          onClose={() => setSelected(null)}
          onMutated={() => {
            queryClient.invalidateQueries({ queryKey: ['repairs'] })
            setSelected(null)
          }}
          onDelivered={(opts) => {
            queryClient.invalidateQueries({ queryKey: ['repairs'] })
            setSelected(null)
            setDeliveryPreview(opts)
          }}
        />
      )}

      {deliveryPreview && (
        <PrinterFlowSheet
          receiptHtml={buildRepairDeliveryHtml(deliveryPreview)}
          jobName={`ใบเสร็จซ่อม #${deliveryPreview.ticketNumber}`}
          previewData={buildRepairDeliveryPreviewData(deliveryPreview)}
          onShare={async () => shareRepairDelivery(deliveryPreview)}
          onClose={() => setDeliveryPreview(null)}
          successNavItems={[
            { label: 'ดูรายการซ่อมทั้งหมด', href: '/sunmi/repairs' },
            { label: 'กลับหน้าหลัก',         href: '/sunmi' },
          ]}
        />
      )}
    </>
  )
}
