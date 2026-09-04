'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Wifi, TrendingUp, Banknote, Smartphone, CreditCard,
  Plus, X, Loader2, Phone, Wallet, ArrowDownLeft, Printer, ScanLine,
} from 'lucide-react'
import Barcode from 'react-barcode'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import { apiErrorMessage, formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type Carrier    = 'AIS' | 'TRUE' | 'DTAC' | 'NT'
type SaleType   = 'PROMO' | 'TOPUP' | 'SIM_SALE' | 'BUNDLE'
type PayMethod  = 'CASH' | 'TRANSFER' | 'CARD'

interface PackageSaleRow {
  id:              string
  receiptNumber:   string
  carrier:         Carrier
  saleType:        SaleType
  packageAmount:   number
  walletDeduction: number
  profit:          number
  paymentMethod:   PayMethod
  amountPaid:      number
  change:          number
  phoneNumber:     string | null
  note:            string | null
  cashierName:     string
  createdAt:       string
  createdBy?:      { name: string }
}

interface WalletBalance { carrier: string; balance: number }
interface ShiftInfo     { id: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const CARRIERS: Carrier[] = ['AIS', 'TRUE', 'DTAC', 'NT']

const SALE_TYPE_LABEL: Record<SaleType, string> = {
  PROMO:    'สมัครโปร',
  TOPUP:    'เติมแพ็ก',
  SIM_SALE: 'ขายซิม',
  BUNDLE:   'ซิม + โปร',
}

const SALE_TYPE_COLOR: Record<SaleType, string> = {
  PROMO:    'bg-blue-100 text-blue-700',
  TOPUP:    'bg-violet-100 text-violet-700',
  SIM_SALE: 'bg-emerald-100 text-emerald-700',
  BUNDLE:   'bg-amber-100 text-amber-700',
}

const CARRIER_COLOR: Record<Carrier, string> = {
  AIS:  'bg-blue-600 text-white',
  TRUE: 'bg-red-600 text-white',
  DTAC: 'bg-orange-500 text-white',
  NT:   'bg-green-600 text-white',
}

const PAY_LABEL: Record<PayMethod, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร',
}

const PRESET_AMOUNTS = [99, 150, 200, 250, 299, 300, 350, 399, 499, 599]
const BARCODE_PRESETS = [150, 200, 250, 300, 350]

// ── Create Dialog ─────────────────────────────────────────────────────────────

interface CreateDialogProps {
  wallets: WalletBalance[]
  shiftId?: string
  cashierName: string
  onClose: () => void
  onDone: () => void
}

function CreateDialog({ wallets, shiftId, cashierName, onClose, onDone }: CreateDialogProps) {
  const [saleType,     setSaleType]     = useState<SaleType>('PROMO')
  const [carrier,      setCarrier]      = useState<Carrier>('AIS')
  const [selPreset,    setSelPreset]    = useState<number | null>(null)
  const [customPrice,  setCustomPrice]  = useState('')
  const [costPrice,    setCostPrice]    = useState('35')
  const [dealerCost,   setDealerCost]   = useState('')
  const [payMethod,    setPayMethod]    = useState<PayMethod>('CASH')
  const [amountPaid,   setAmountPaid]   = useState('')
  const [phoneNumber,  setPhoneNumber]  = useState('')
  const [note,         setNote]         = useState('')
  const [scanInput,    setScanInput]    = useState('')
  const scanRef = useState<ReturnType<typeof setTimeout> | null>(null)

  const price     = selPreset !== null ? selPreset : (Number(customPrice) || 0)
  const cost      = Number(costPrice) || 0
  const walletBal = wallets.find(w => w.carrier === carrier)?.balance ?? 0

  // For packages: carrier deducts 97% from wallet, 3% is dealer profit
  // User can override via dealerCost field if their carrier deal differs
  const pkgDeduction = dealerCost !== '' ? Number(dealerCost) : Math.round(price * 0.97 * 100) / 100
  const pkgProfit    = price - pkgDeduction

  const deduction    = saleType === 'SIM_SALE' ? cost : pkgDeduction
  const profit       = saleType === 'SIM_SALE' ? price - cost : pkgProfit
  const paidNum      = Number(amountPaid) || 0
  const change       = payMethod === 'CASH' ? Math.max(0, paidNum - price) : 0
  const insufficient = saleType !== 'SIM_SALE' && price > 0 && deduction > walletBal
  const canSubmit    = !!shiftId && price > 0 && !insufficient
    && (payMethod !== 'CASH' || paidNum >= price)

  // Handle barcode scanner input (USB scanner = fast keystrokes + Enter)
  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const val = scanInput.trim()
      const num = Number(val)
      if (num > 0) {
        if (PRESET_AMOUNTS.includes(num)) {
          setSelPreset(num)
          setCustomPrice('')
          setDealerCost('')
        } else {
          setSelPreset(null)
          setCustomPrice(val)
          setDealerCost('')
        }
      }
      setScanInput('')
    }
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (saleType === 'SIM_SALE') {
        return api.post('/carrier-wallet/sim-sale', {
          carrier, packageAmount: price, costPrice: cost,
          paymentMethod: payMethod, amountPaid: payMethod === 'CASH' ? paidNum : price,
          phoneNumber: phoneNumber.trim() || undefined,
          note: note.trim() || undefined, shiftId, cashierName,
        })
      }
      return api.post('/carrier-wallet/package-sale', {
        carrier, packageAmount: price, saleType,
        paymentMethod: payMethod, amountPaid: payMethod === 'CASH' ? paidNum : price,
        phoneNumber: phoneNumber.trim() || undefined,
        note: note.trim() || undefined, shiftId, cashierName,
      })
    },
    onSuccess: () => {
      toast.success('บันทึกการขายแล้ว')
      onDone()
    },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-slate-900">บันทึกการขายซิม/แพ็กเกจ</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Barcode scan input */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 border-2 border-dashed border-slate-200 focus-within:border-blue-400">
            <ScanLine className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="แสกนบาร์โค้ด หรือพิมพ์ราคาแล้ว Enter..."
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={handleScanKeyDown}
              className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
              autoFocus
            />
            {scanInput && (
              <button onClick={() => setScanInput('')} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Sale type */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">ประเภทการขาย</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(SALE_TYPE_LABEL) as SaleType[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setSaleType(t); setSelPreset(null); setCustomPrice('') }}
                  className={`py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                    saleType === t
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {SALE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Carrier */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">ค่าย</label>
            <div className="grid grid-cols-4 gap-2">
              {CARRIERS.map(c => (
                <button
                  key={c}
                  onClick={() => setCarrier(c)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${
                    carrier === c ? CARRIER_COLOR[c] : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {saleType !== 'SIM_SALE' && (
              <p className="text-xs text-slate-500">
                กระเป๋า {carrier}: <span className={`font-semibold ${walletBal < 200 ? 'text-red-600' : 'text-slate-700'}`}>{formatThaiMoney(walletBal)}</span>
              </p>
            )}
          </div>

          {/* Price */}
          {saleType !== 'SIM_SALE' ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">ราคาแพ็กเกจ (บาท)</label>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map(amt => (
                  <button
                    key={amt}
                    onClick={() => { setSelPreset(amt); setCustomPrice('') }}
                    className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${
                      selPreset === amt ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {amt}
                  </button>
                ))}
              </div>
              <input
                type="number" inputMode="numeric" placeholder="ราคากำหนดเอง..."
                value={customPrice}
                onChange={e => { setCustomPrice(e.target.value); setSelPreset(null) }}
                className="w-full h-11 px-3 border border-slate-200 rounded-xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">ราคาขาย (บาท)</label>
                <input
                  type="number" inputMode="numeric" placeholder="49"
                  value={customPrice}
                  onChange={e => setCustomPrice(e.target.value)}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">ต้นทุน (บาท)</label>
                <input
                  type="number" inputMode="numeric" placeholder="35"
                  value={costPrice}
                  onChange={e => setCostPrice(e.target.value)}
                  className="w-full h-11 px-3 border border-slate-200 rounded-xl text-base font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Dealer cost override (packages only) */}
          {saleType !== 'SIM_SALE' && price > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 whitespace-nowrap">ต้นทุนดีลเลอร์ (บาท)</label>
              <input
                type="number" inputMode="numeric"
                placeholder={price > 0 ? String(Math.round(price * 0.97 * 100) / 100) : '97%'}
                value={dealerCost}
                onChange={e => setDealerCost(e.target.value)}
                className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-xs text-slate-400 whitespace-nowrap">ค่าเริ่มต้น 97%</span>
            </div>
          )}

          {/* Profit summary */}
          {price > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                {saleType === 'SIM_SALE'
                  ? `ต้นทุน ${formatThaiMoney(deduction)} → `
                  : `หักกระเป๋า ${formatThaiMoney(deduction)} → `}
              </span>
              <span className={`font-bold flex items-center gap-1 ${profit > 0 ? 'text-emerald-700' : profit < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                <TrendingUp className="h-4 w-4" />
                {profit === 0 ? 'ไม่มีมาร์กอัป (คอมจากค่าย)' : `กำไร ${formatThaiMoney(profit)}`}
              </span>
            </div>
          )}

          {insufficient && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 font-medium">
              ยอดกระเป๋า {carrier} ไม่เพียงพอ (มี {formatThaiMoney(walletBal)})
            </p>
          )}

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Phone className="h-4 w-4 text-slate-400" /> เบอร์โทร (ไม่บังคับ)
            </label>
            <input
              type="tel" inputMode="tel" placeholder="0812345678"
              value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">หมายเหตุ (ไม่บังคับ)</label>
            <input
              type="text" placeholder="เช่น 30 วัน, ซิมฟรีพร้อมโปร..."
              value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Payment */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">ช่องทางรับเงิน</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'CASH', label: 'เงินสด', icon: Banknote },
                { v: 'TRANSFER', label: 'โอนเงิน', icon: Smartphone },
                { v: 'CARD', label: 'บัตร', icon: CreditCard },
              ] as const).map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  onClick={() => setPayMethod(v as PayMethod)}
                  className={`flex flex-col items-center py-3 rounded-xl border-2 text-xs font-semibold transition-colors ${
                    payMethod === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-5 w-5 mb-1" />{label}
                </button>
              ))}
            </div>
          </div>

          {payMethod === 'CASH' && price > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">รับเงินมา (บาท)</label>
              <input
                type="number" inputMode="numeric" placeholder={String(price)}
                value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
                className="w-full h-12 px-3 border-2 border-slate-200 rounded-xl text-2xl font-bold focus:outline-none focus:border-blue-500 tabular-nums"
                autoFocus
              />
              {change > 0 && (
                <p className="text-lg font-bold text-emerald-700 text-right">เงินทอน: {formatThaiMoney(change)}</p>
              )}
            </div>
          )}

          {!shiftId && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-center font-medium">
              กรุณาเปิดกะก่อนขาย
            </p>
          )}
        </div>

        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50">
            ยกเลิก
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50 hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            บันทึก {price > 0 ? `— ${formatThaiMoney(price)}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Print Barcodes Modal ──────────────────────────────────────────────────────

function PrintBarcodesModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      {/* Screen overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 print:hidden">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
          <div className="flex items-center justify-between p-5 border-b">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Printer className="h-5 w-5 text-slate-600" /> พิมพ์บาร์โค้ดโปร
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-500 mb-4">แสกนบาร์โค้ดในหน้าต่าง "บันทึกการขาย" เพื่อเลือกราคาแพ็กเกจอัตโนมัติ</p>
            <div className="grid grid-cols-5 gap-3 mb-6">
              {BARCODE_PRESETS.map(amt => (
                <div key={amt} className="flex flex-col items-center border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <Barcode
                    value={String(amt)}
                    format="CODE128"
                    width={1.5}
                    height={60}
                    fontSize={14}
                    margin={4}
                    displayValue={false}
                  />
                  <span className="text-base font-bold text-slate-800 mt-1">{amt} บาท</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => window.print()}
              className="w-full py-3 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 flex items-center justify-center gap-2"
            >
              <Printer className="h-4 w-4" /> สั่งพิมพ์
            </button>
          </div>
        </div>
      </div>

      {/* Print-only layout */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #barcode-print-sheet { display: flex !important; }
        }
      `}</style>
      <div id="barcode-print-sheet" className="hidden print:flex flex-wrap gap-4 p-4">
        {BARCODE_PRESETS.map(amt => (
          <div key={amt} style={{ border: '1px solid #ccc', padding: '8px', borderRadius: '8px', textAlign: 'center', width: '140px' }}>
            <Barcode
              value={String(amt)}
              format="CODE128"
              width={1.5}
              height={60}
              fontSize={14}
              margin={4}
              displayValue={false}
            />
            <div style={{ fontWeight: 'bold', fontSize: '18px', marginTop: '4px' }}>{amt} บาท</div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Topup Dialog ──────────────────────────────────────────────────────────────

interface TopupDialogProps {
  shiftId?: string
  onClose: () => void
  onDone: () => void
}

function TopupDialog({ shiftId, onClose, onDone }: TopupDialogProps) {
  const [carrier, setCarrier] = useState<Carrier>('AIS')
  const [amount,  setAmount]  = useState('')
  const [note,    setNote]    = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post('/carrier-wallet/topup', {
      carrier,
      amount: Number(amount),
      note: note.trim() || undefined,
      shiftId,
    }),
    onSuccess: () => { toast.success(`เติมกระเป๋า ${carrier} สำเร็จ`); onDone() },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  const canSubmit = Number(amount) > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5 text-emerald-600" /> เติมกระเป๋าค่าย
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-500">บันทึกเมื่อโอนเงินเข้าแอปดีลเลอร์ค่าย</p>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">ค่าย</label>
            <div className="grid grid-cols-4 gap-2">
              {CARRIERS.map(c => (
                <button
                  key={c}
                  onClick={() => setCarrier(c)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-colors ${
                    carrier === c ? CARRIER_COLOR[c] : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">จำนวนเงิน (บาท)</label>
            <input
              type="number" inputMode="numeric" placeholder="500"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full h-14 px-4 border-2 border-slate-200 rounded-xl text-3xl font-bold focus:outline-none focus:border-emerald-500 tabular-nums"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">หมายเหตุ (ไม่บังคับ)</label>
            <input
              type="text" placeholder="เช่น โอนผ่านธนาคาร..."
              value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {!shiftId && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-center font-medium">
              กรุณาเปิดกะก่อนเติม
            </p>
          )}
        </div>
        <div className="p-5 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50">ยกเลิก</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || !shiftId || mutation.isPending}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50 hover:bg-emerald-700 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            เติม {amount ? `฿${Number(amount).toLocaleString()}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PackageSalesPage() {
  const { user, hasModule } = useAuthStore()
  const qc = useQueryClient()

  const [showCreate,        setShowCreate]        = useState(false)
  const [showTopup,         setShowTopup]         = useState(false)
  const [showPrintBarcodes, setShowPrintBarcodes] = useState(false)
  const [activeTab,         setActiveTab]         = useState<'sales' | 'topups'>('sales')
  const [filterDate,   setFilterDate]   = useState(new Date().toISOString().slice(0, 10))
  const [filterCarrier, setFilterCarrier] = useState('')
  const [filterType,   setFilterType]   = useState('')

  if (!hasModule('package_sales')) {
    return <ModuleGate module="package_sales">{null}</ModuleGate>
  }

  const { data: shift } = useQuery<ShiftInfo | null>({
    queryKey: ['shifts', 'current'],
    queryFn:  () => api.get('/shifts/current').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: wallets = [] } = useQuery<WalletBalance[]>({
    queryKey: ['carrier-wallet', 'balances'],
    queryFn:  () => api.get('/carrier-wallet/balances').then(r => r.data),
    staleTime: 15_000,
  })

  interface MovementRow {
    id: string; carrier: string; type: string;
    amount: number; balanceBefore: number; balanceAfter: number;
    note: string | null; createdAt: string;
  }

  const { data: movements = [], isLoading: movLoading } = useQuery<MovementRow[]>({
    queryKey: ['carrier-wallet', 'movements', filterDate, filterCarrier],
    queryFn:  () => api.get('/carrier-wallet/movements', {
      params: { carrier: filterCarrier || undefined, date: filterDate },
    }).then(r => r.data),
    staleTime: 30_000,
    enabled: activeTab === 'topups',
  })

  const topups = movements.filter(m => m.type === 'TOPUP')

  const { data: sales = [], isLoading } = useQuery<PackageSaleRow[]>({
    queryKey: ['package-sales', filterDate, filterCarrier, filterType],
    queryFn:  () => api.get('/carrier-wallet/package-sales/list', {
      params: {
        startDate: filterDate,
        endDate:   filterDate,
        carrier:   filterCarrier || undefined,
        saleType:  filterType   || undefined,
      },
    }).then(r => r.data),
    staleTime: 30_000,
  })

  // Summary
  const totalRevenue = sales.reduce((s, r) => s + r.packageAmount, 0)
  const totalProfit  = sales.reduce((s, r) => s + r.profit, 0)
  const countBySaleType = sales.reduce((acc, r) => {
    acc[r.saleType] = (acc[r.saleType] ?? 0) + 1
    return acc
  }, {} as Record<SaleType, number>)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Wifi className="h-6 w-6 text-blue-600" /> ขายซิม / แพ็กเกจ
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">บันทึกการขายซิมการ์ดและแพ็กเกจอินเทอร์เน็ต</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => setShowPrintBarcodes(true)}
              className="flex items-center gap-2 bg-slate-600 text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-slate-700 transition-colors"
            >
              <Printer className="h-4 w-4" /> พิมพ์บาร์โค้ด
            </button>
            <button
              onClick={() => setShowTopup(true)}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
            >
              <ArrowDownLeft className="h-4 w-4" /> เติมกระเป๋า
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" /> บันทึกการขาย
            </button>
          </div>
        </div>

        {/* Wallet balances */}
        <div className="grid grid-cols-4 gap-3">
          {wallets.map(w => (
            <div key={w.carrier} className={`rounded-xl px-4 py-3 text-white ${CARRIER_COLOR[w.carrier as Carrier] ?? 'bg-slate-600 text-white'}`}>
              <p className="text-xs font-semibold opacity-80">{w.carrier}</p>
              <p className="text-xl font-bold tabular-nums mt-0.5">{formatThaiMoney(w.balance)}</p>
            </div>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">รายการทั้งหมด</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{sales.length}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(Object.entries(countBySaleType) as [SaleType, number][]).map(([t, n]) => (
                <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${SALE_TYPE_COLOR[t]}`}>
                  {SALE_TYPE_LABEL[t]} {n}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">ยอดรับรวม</p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">{formatThaiMoney(totalRevenue)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">กำไรรวม</p>
            <p className="text-3xl font-bold text-emerald-700 tabular-nums mt-1">{formatThaiMoney(totalProfit)}</p>
          </div>
        </div>

        {/* Tabs + Filters */}
        <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'sales' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              ยอดขาย
            </button>
            <button
              onClick={() => setActiveTab('topups')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'topups' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" /> ประวัติเติมกระเป๋า
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-600">วันที่</label>
              <input
                type="date" value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-600">ค่าย</label>
              <select
                value={filterCarrier}
                onChange={e => setFilterCarrier(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {activeTab === 'sales' && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-slate-600">ประเภท</label>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="h-9 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">ทั้งหมด</option>
                  {(Object.entries(SALE_TYPE_LABEL) as [SaleType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Sales Table */}
        {activeTab === 'sales' && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> กำลังโหลด...
              </div>
            ) : sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <Wifi className="h-10 w-10 opacity-30" />
                <p className="text-sm">ยังไม่มีรายการ</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">เลขที่</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">ประเภท</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">ค่าย</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">ราคาขาย</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">กำไร</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">เบอร์</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">พนักงาน</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">เวลา</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sales.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{row.receiptNumber}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SALE_TYPE_COLOR[row.saleType]}`}>
                          {SALE_TYPE_LABEL[row.saleType]}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold text-white ${CARRIER_COLOR[row.carrier]?.split(' ')[0]}`}>
                          {row.carrier}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold">{formatThaiMoney(row.packageAmount)}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-emerald-700">{formatThaiMoney(row.profit)}</td>
                      <td className="py-3 px-4 text-slate-500">{row.phoneNumber ?? '—'}</td>
                      <td className="py-3 px-4 text-slate-600">{row.createdBy?.name ?? row.cashierName}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {format(new Date(row.createdAt), 'HH:mm', { locale: th })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Topup History */}
        {activeTab === 'topups' && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            {movLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> กำลังโหลด...
              </div>
            ) : topups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <Wallet className="h-10 w-10 opacity-30" />
                <p className="text-sm">ยังไม่มีการเติมกระเป๋าในวันนี้</p>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex flex-wrap gap-4">
                  {CARRIERS.filter(c => !filterCarrier || filterCarrier === c).map(c => {
                    const total = topups.filter(m => m.carrier === c).reduce((s, m) => s + m.amount, 0)
                    if (total === 0) return null
                    return (
                      <div key={c} className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold text-white ${CARRIER_COLOR[c]?.split(' ')[0]}`}>{c}</span>
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatThaiMoney(total)}</span>
                      </div>
                    )
                  })}
                  <span className="ml-auto text-sm text-emerald-600 font-semibold">
                    รวมเติมทั้งหมด: {formatThaiMoney(topups.reduce((s, m) => s + m.amount, 0))}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">ค่าย</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">เติม</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">ก่อนเติม</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600">หลังเติม</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">หมายเหตุ</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600">เวลา</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {topups.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold text-white ${CARRIER_COLOR[row.carrier as Carrier]?.split(' ')[0] ?? 'bg-slate-500'}`}>
                            {row.carrier}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums font-bold text-emerald-700">+{formatThaiMoney(row.amount)}</td>
                        <td className="py-3 px-4 text-right tabular-nums text-slate-500">{formatThaiMoney(row.balanceBefore)}</td>
                        <td className="py-3 px-4 text-right tabular-nums font-semibold">{formatThaiMoney(row.balanceAfter)}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{row.note ?? '—'}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {format(new Date(row.createdAt), 'HH:mm', { locale: th })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateDialog
          wallets={wallets}
          shiftId={shift?.id}
          cashierName={user?.name ?? ''}
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false)
            qc.invalidateQueries({ queryKey: ['package-sales'] })
            qc.invalidateQueries({ queryKey: ['carrier-wallet'] })
          }}
        />
      )}

      {showTopup && (
        <TopupDialog
          shiftId={shift?.id}
          onClose={() => setShowTopup(false)}
          onDone={() => {
            setShowTopup(false)
            qc.invalidateQueries({ queryKey: ['carrier-wallet'] })
          }}
        />
      )}

      {showPrintBarcodes && (
        <PrintBarcodesModal onClose={() => setShowPrintBarcodes(false)} />
      )}
    </div>
  )
}
