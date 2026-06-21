'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  MessageSquare, Save, Loader2, Eye, EyeOff, CheckCircle2,
  Info, QrCode,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Card, CardContent } from '@/components/ui/card'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

export default function LineSettingsPage() {
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: 30_000,
  })

  const [token, setToken] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [tokenDirty, setTokenDirty] = useState(false)

  const tokenIsSet = (settings?.lineChannelAccessToken ?? '').startsWith('****')

  useEffect(() => {
    if (settings) {
      // Show placeholder for masked token; user must type a new value to change it
      setToken(settings.lineChannelAccessToken ?? '')
      setEnabled(settings.lineNotifyEnabled ?? false)
      setTokenDirty(false)
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: (data: { lineChannelAccessToken?: string; lineNotifyEnabled: boolean }) =>
      api.patch('/settings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      toast.success('บันทึกการตั้งค่า LINE แล้ว')
      setTokenDirty(false)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'เกิดข้อผิดพลาด')
    },
  })

  const handleSave = () => {
    const isNewToken = tokenDirty && token.trim() && !token.startsWith('****')
    if (enabled && !tokenIsSet && !isNewToken) {
      toast.error('กรุณากรอก Channel Access Token ก่อนเปิดใช้งาน')
      return
    }
    mutation.mutate({
      // Only send token if user typed a new value (not the masked placeholder)
      ...(isNewToken ? { lineChannelAccessToken: token.trim() } : {}),
      lineNotifyEnabled: enabled,
    })
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin.replace(':3001', ':3000')}/api/v1/public/line/webhook`
    : '/api/v1/public/line/webhook'

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="LINE Notification"
        subtitle="แจ้งเตือนลูกค้าอัตโนมัติผ่าน LINE เมื่อสถานะงานซ่อมเปลี่ยน"
        icon={MessageSquare}
      />

      {/* Setup guide */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold">ขั้นตอนการตั้งค่า LINE OA</p>
              <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-400">
                <li>สร้าง LINE Official Account ที่ <a href="https://manager.line.biz" target="_blank" rel="noopener" className="underline">manager.line.biz</a></li>
                <li>ไปที่ Settings → Messaging API → Enable</li>
                <li>คัดลอก Channel Access Token (Long-lived)</li>
                <li>วาง Token ในช่องด้านล่าง</li>
                <li>ตั้งค่า Webhook URL ใน LINE Developer Console</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      <SectionCard title="การตั้งค่า">
        <div className="space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">เปิดใช้งาน LINE Notification</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                ส่งข้อความอัตโนมัติเมื่อสถานะงานซ่อมเปลี่ยน
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              disabled={isLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
                enabled ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
              aria-checked={enabled}
              role="switch"
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Token input */}
          <div className="space-y-1.5">
            <Label htmlFor="line-token" className="flex items-center gap-2">
              Channel Access Token
              {tokenIsSet && !tokenDirty && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-normal">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  ตั้งค่าแล้ว
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                id="line-token"
                type={showToken ? 'text' : 'password'}
                placeholder={tokenIsSet && !tokenDirty ? 'คลิกพิมพ์ token ใหม่เพื่อเปลี่ยน' : 'วาง Channel Access Token ที่นี่'}
                value={token}
                onChange={(e) => { setToken(e.target.value); setTokenDirty(true) }}
                onFocus={() => { if (token.startsWith('****')) { setToken(''); setTokenDirty(true) } }}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Long-lived token จาก LINE Developer Console → Messaging API
              {tokenIsSet && !tokenDirty && ' · คลิกเพื่อเปลี่ยน token ใหม่'}
            </p>
          </div>

          {/* Webhook URL */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Webhook URL (ใช้ใน LINE Console)
            </Label>
            <div className="flex gap-2">
              <code className="flex-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-300 break-all">
                {webhookUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl)
                  toast.success('คัดลอกแล้ว')
                }}
              >
                คัดลอก
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              วาง URL นี้ใน LINE Developer Console → Messaging API → Webhook settings
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={mutation.isPending || isLoading}
            className="gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            บันทึก
          </Button>
        </div>
      </SectionCard>

      {/* Notification events */}
      <SectionCard title="เหตุการณ์ที่แจ้งเตือน">
        <div className="divide-y dark:divide-slate-700">
          {[
            { status: 'RECEIVED',         label: 'รับงานซ่อม',           active: true },
            { status: 'WAITING_APPROVAL', label: 'รออนุมัติราคา',        active: true },
            { status: 'APPROVED',         label: 'อนุมัติราคาแล้ว',       active: true },
            { status: 'IN_PROGRESS',      label: 'กำลังซ่อม',            active: false },
            { status: 'QC_PENDING',       label: 'รอตรวจสอบ QC',         active: false },
            { status: 'COMPLETED',        label: 'ซ่อมเสร็จแล้ว',        active: true },
            { status: 'READY_PICKUP',     label: 'พร้อมรับเครื่อง 🎉',   active: true },
            { status: 'DELIVERED',        label: 'ส่งมอบเรียบร้อย',       active: true },
          ].map((ev) => (
            <div key={ev.status} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{ev.label}</span>
              {ev.active ? (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  ส่งแจ้งเตือน
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">ไม่ส่ง</span>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* How to link customer LINE */}
      <SectionCard title="วิธีเชื่อมต่อ LINE ลูกค้า">
        <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
          <p>เพื่อให้ระบบส่ง LINE ถึงลูกค้าได้ ลูกค้าต้องเพิ่ม LINE OA ของร้านเป็นเพื่อนก่อน</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>ลูกค้าสแกน QR Code หรือเพิ่ม LINE OA</li>
            <li>ส่งข้อความหมายเลขโทรศัพท์ที่ลงทะเบียน (10 หลัก)</li>
            <li>ระบบจะเชื่อมต่อ LINE กับข้อมูลลูกค้าอัตโนมัติ</li>
            <li>หลังจากนั้น ลูกค้าจะได้รับแจ้งเตือนผ่าน LINE</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            หมายเหตุ: สามารถดู/แก้ไข LINE User ID ของลูกค้าได้ที่หน้ารายละเอียดลูกค้า
          </p>
        </div>
      </SectionCard>
    </div>
  )
}
