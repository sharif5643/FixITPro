'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Banknote, Smartphone, CreditCard,
  Wifi, TrendingUp, Phone, Wallet, AlertTriangle,
} from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
import { useAuthStore } from '@/store/auth.store'
import {
  buildPackageSaleHtml, buildPackageSalePreviewData, sharePackageSale,
  type PrintPackageSaleOptions,
} from '@/lib/printer'
import { pushBackHandler } from '@/lib/back-stack'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { ShopSettings, PaymentMethod } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const CARRIERS = ['AIS', 'TRUE', 'DTAC', 'NT'] as const
type Carrier = typeof CARRIERS[number]

const CARRIER_COLORS: Record<Carrier, { bg: string; text: string; border: string; badge: string }> = {
  AIS:  { bg: 'bg-blue-600',   text: 'text-white',     border: 'border-blue-600',   badge: 'bg-blue-100 text-blue-700 border-blue-300' },
  TRUE:  { bg: 'bg-red-600',    text: 'text-white',     border: 'border-red-600',    badge: 'bg-red-100 text-red-700 border-red-300' },
  DTAC: { bg: 'bg-orange-500', text: 'text-white',     border: 'border-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-300' },
  NT:   { bg: 'bg-green-600',  text: 'text-white',     border: 'border-green-600',  badge: 'bg-green-100 text-green-700 border-green-300' },
}

const PRESET_AMOUNTS = [99, 150, 200, 250, 299, 399, 499, 599]

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { value: 'CASH',     label: 'เงินสด',  icon: Banknote },
  { value: 'TRANSFER', label: 'โอนเงิน', icon: Smartphone },
  { value: 'CARD',     label: 'บัตร',    icon: CreditCard },
]

type WalletBalance = { carrier: string; balance: number }

// ── PackageSale API response ──────────────────────────────────────────────────

interface PackageSaleResult {
  receiptNumber:   string
  carrier:         Carrier
  packageAmount:   number
  walletDeduction: number
  profit:          number
  amountPaid:      number
  change:          number
  walletBalance:   number
  createdAt:       string
}

// ── Checkout sheet ─────────────────────────────────────────────────────────────

interface CheckoutSheetProps {
  carrier:      Carrier
  shiftId?:     string
  settings?:    ShopSettings
  cashierName:  string
  walletBalance: number
  onClose:      () => void
  onSuccess:    (result: PackageSaleResult, opts: PrintPackageSaleOptions) => void
}

function CheckoutSheet({
  carrier, shiftId, settings, cashierName, walletBalance, onClose, onSuccess,
}: CheckoutSheetProps) {
  const [method,       setMethod]       = useState<PaymentMethod>('CASH')
  const [amountPaid,   setAmountPaid]   = useState('')
  const [phoneNumber,  setPhoneNumber]  = useState('')
  const [note,         setNote]         = useState('')
  const [customPrice,  setCustomPrice]  = useState('')
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)

  useEffect(() => pushBackHandler(onClose), [onClose])
  useEffect(() => { if (method !== 'CASH') setAmountPaid('') }, [method])

  const price = selectedPreset !== null
    ? selectedPreset
    : (Number(customPrice) || 0)

  const walletDeduction = Math.round(price * 0.97 * 100) / 100
  const profit          = Math.round(price * 0.03 * 100) / 100
  const paidNum         = Number(amountPaid) || 0
  const change          = method === 'CASH' ? Math.max(0, paidNum - price) : 0
  const insufficient    = price > 0 && walletDeduction > walletBalance
  const canSubmit       = !!shiftId && price > 0 && !insufficient
    && (method !== 'CASH' ? true : paidNum >= price)

  const quickAmounts = useMemo(() => {
    if (!price) return []
    const raw = [price, Math.ceil(price / 100) * 100, Math.ceil(price / 500) * 500, 1000]
    return Array.from(new Set(raw)).filter((v) => v >= price).slice(0, 4)
  }, [price])

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/carrier-wallet/package-sale', {
        carrier,
        packageAmount: price,
        paymentMethod: method,
        amountPaid:    method === 'CASH' ? paidNum : price,
        phoneNumber:   phoneNumber.trim() || undefined,
        note:          note.trim() || undefined,
        shiftId,
        cashierName,
      }),
    onSuccess: (res) => {
      const result = res.data as PackageSaleResult
      const opts: PrintPackageSaleOptions = {
        shopName:        settings?.shopName ?? 'FixITPro',
        shopPhone:       settings?.shopPhone ?? undefined,
        receiptNumber:   result.receiptNumber,
        date:            format(new Date(result.createdAt), 'dd/MM/yyyy HH:mm', { locale: th }),
        cashierName,
        carrier,
        packageAmount:   result.packageAmount,
        walletDeduction: result.walletDeduction,
        profit:          result.profit,
        walletBalance:   result.walletBalance,
        phoneNumber:     phoneNumber.trim() || undefined,
        note:            note.trim() || undefined,
        paymentMethod:   method,
        amountPaid:      result.amountPaid,
        change:          result.change,
        footer:          settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
        taxId:           settings?.taxId ?? undefined,
        showTaxId:       settings?.showTaxId ?? true,
        paymentQrUrl:    settings?.paymentQrUrl ?? undefined,
        showLogo:        settings?.showLogo ?? true,
        logoUrl:         settings?.logoUrl ?? undefined,
      }
      onSuccess(result, opts)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const colors = CARRIER_COLORS[carrier]

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[96vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-xl text-slate-900">เติมเน็ต / SIM</p>
            <span className={`px-3 py-1 rounded-full text-sm font-bold border ${colors.badge}`}>
              {carrier}
            </span>
          </div>

          {/* Wallet balance */}
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${walletBalance < 200 ? 'bg-orange-50 border border-orange-200' : 'bg-slate-50'}`}>
            <Wallet className={`h-5 w-5 shrink-0 ${walletBalance < 200 ? 'text-orange-500' : 'text-slate-400'}`} />
            <div className="flex-1">
              <p className="text-xs text-slate-500">ยอดคงเหลือกระเป๋า {carrier}</p>
              <p className={`text-xl font-bold tabular-nums ${walletBalance < 200 ? 'text-orange-600' : 'text-slate-900'}`}>
                {formatThaiMoney(walletBalance)}
              </p>
            </div>
          </div>

          {/* Package amount — presets */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-600">เลือกราคาแพ็กเกจ</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => { setSelectedPreset(amt); setCustomPrice('') }}
                  className={`py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
                    selectedPreset === amt
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'
                  }`}
                >
                  {amt}
                </button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-600">ราคากำหนดเอง (บาท)</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={customPrice}
              onChange={(e) => { setCustomPrice(e.target.value); setSelectedPreset(null) }}
              placeholder="กรอกราคา..."
              className="w-full h-12 px-3 border-2 border-slate-200 rounded-xl text-xl font-bold bg-white focus:outline-none focus:border-blue-500 tabular-nums"
            />
          </div>

          {/* Profit breakdown */}
          {price > 0 && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">ราคาขาย</span>
                <span className="font-bold text-slate-900">{formatThaiMoney(price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">หักกระเป๋า (97%)</span>
                <span className={`font-semibold ${insufficient ? 'text-red-600' : 'text-slate-700'}`}>
                  {formatThaiMoney(walletDeduction)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">กำไร (3%)</span>
                <span className="font-semibold text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {formatThaiMoney(profit)}
                </span>
              </div>
              {insufficient && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 font-medium">
                    ยอดกระเป๋า{carrier} ไม่เพียงพอ (มี {formatThaiMoney(walletBalance)})
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Phone number */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Phone className="h-4 w-4 text-slate-400" />
              เบอร์โทรที่เติม
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="0812345678"
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-600">หมายเหตุ (ไม่บังคับ)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น แพ็กเกจ 30 วัน"
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setMethod(value)}
                className={`flex flex-col items-center py-4 rounded-xl border-2 font-medium text-sm transition-colors ${
                  method === value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                <Icon className="h-6 w-6 mb-1" />
                {label}
              </button>
            ))}
          </div>

          {/* Cash input */}
          {method === 'CASH' && price > 0 && (
            <div className="space-y-2">
              <label className="text-sm text-slate-600 font-semibold">รับเงินมา (บาท)</label>
              <input
                type="number"
                inputMode="numeric"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder={String(price)}
                className="w-full h-16 px-4 border-2 border-slate-200 rounded-xl text-3xl font-bold bg-white focus:outline-none focus:border-blue-500 tabular-nums"
                autoFocus
              />
              {change > 0 && (
                <p className="text-xl font-bold text-green-700 text-right pr-1">
                  เงินทอน: {formatThaiMoney(change)}
                </p>
              )}
              {amountPaid !== '' && paidNum < price && (
                <p className="text-sm text-red-500 text-right pr-1">
                  ขาดอีก {formatThaiMoney(price - paidNum)}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                {quickAmounts.map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmountPaid(String(v))}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      paidNum === v
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                    }`}
                  >
                    {formatThaiMoney(v)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!shiftId && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-center font-medium">
              กรุณาเปิดกะก่อนขาย
            </p>
          )}

          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="w-full h-16 rounded-2xl bg-blue-600 text-white text-xl font-bold active:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
              : price > 0
                ? `ยืนยัน — ${formatThaiMoney(price)}`
                : 'เลือกราคาก่อน'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SimSalesPage() {
  const user = useAuthStore((s) => s.user)
  const qc   = useQueryClient()

  const [selectedCarrier, setSelectedCarrier] = useState<Carrier | null>(null)
  const [receiptOpts,     setReceiptOpts]     = useState<PrintPackageSaleOptions | null>(null)

  const { data: currentShift } = useQuery<{ id: string } | null>({
    queryKey:  ['shifts', 'current'],
    queryFn:   async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey:  ['settings'],
    queryFn:   async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const { data: wallets = [] } = useQuery<WalletBalance[]>({
    queryKey:  ['carrier-wallet', 'balances'],
    queryFn:   async () => (await api.get('/carrier-wallet/balances')).data,
    staleTime: 15_000,
  })

  function getBalance(carrier: Carrier) {
    return wallets.find((w) => w.carrier === carrier)?.balance ?? 0
  }

  function handleSuccess(_result: PackageSaleResult, opts: PrintPackageSaleOptions) {
    setSelectedCarrier(null)
    setReceiptOpts(opts)
    qc.invalidateQueries({ queryKey: ['carrier-wallet'] })
  }

  return (
    <>
      <SunmiShell title="เติมเน็ต / SIM" showBack>
        <div className="p-3 space-y-4">

          {!currentShift && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <p className="text-sm text-amber-700 font-semibold">กรุณาเปิดกะก่อนขาย</p>
            </div>
          )}

          {/* Carrier cards */}
          <div className="grid grid-cols-2 gap-3">
            {CARRIERS.map((c) => {
              const balance = getBalance(c)
              const colors  = CARRIER_COLORS[c]
              const low     = balance < 200
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCarrier(c)}
                  className={`relative rounded-2xl p-4 text-left shadow-sm active:scale-[0.97] transition-transform ${colors.bg}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Wifi className={`h-5 w-5 ${colors.text}`} />
                    <span className={`font-bold text-lg ${colors.text}`}>{c}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${low ? 'text-yellow-200' : 'text-white/80'}`}>
                    <Wallet className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium">กระเป๋า</span>
                  </div>
                  <p className={`text-xl font-bold tabular-nums mt-0.5 ${low ? 'text-yellow-200' : colors.text}`}>
                    {formatThaiMoney(balance)}
                  </p>
                  {low && (
                    <div className="absolute top-2 right-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-300" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Info */}
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">วิธีคำนวณกำไร</p>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
              <span>กำไร = 3% ของราคาขาย · หักกระเป๋า = 97%</span>
            </div>
            <p className="text-xs text-slate-400">เช่น ขาย ฿200 → กำไร ฿6 · หักกระเป๋า ฿194</p>
          </div>
        </div>
      </SunmiShell>

      {selectedCarrier && (
        <CheckoutSheet
          carrier={selectedCarrier}
          shiftId={currentShift?.id}
          settings={settings}
          cashierName={user?.name ?? ''}
          walletBalance={getBalance(selectedCarrier)}
          onClose={() => setSelectedCarrier(null)}
          onSuccess={handleSuccess}
        />
      )}

      {receiptOpts && (
        <PrinterFlowSheet
          receiptHtml={buildPackageSaleHtml(receiptOpts)}
          jobName={`PKG #${receiptOpts.receiptNumber}`}
          previewData={buildPackageSalePreviewData(receiptOpts)}
          onShare={async () => sharePackageSale(receiptOpts)}
          onClose={() => setReceiptOpts(null)}
          successNavItems={[
            { label: 'เติมเน็ต / SIM ต่อ', href: '/sunmi/sim-sales' },
            { label: 'กลับหน้าหลัก',       href: '/sunmi' },
          ]}
        />
      )}
    </>
  )
}
