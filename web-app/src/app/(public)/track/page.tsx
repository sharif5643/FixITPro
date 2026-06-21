'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Wrench, Phone, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function TrackPage() {
  const router = useRouter()
  const [ticketNumber, setTicketNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const t = ticketNumber.trim().toUpperCase()
    const p = phone.trim()
    if (!t) { setError('กรุณากรอกหมายเลขงานซ่อม'); return }
    if (!p) { setError('กรุณากรอกหมายเลขโทรศัพท์'); return }
    router.push(`/track/${encodeURIComponent(t)}?phone=${encodeURIComponent(p)}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30">
              <Wrench className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ติดตามงานซ่อม</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              ตรวจสอบสถานะงานซ่อมของคุณแบบ real-time
            </p>
          </div>
        </div>

        {/* Form card */}
        <Card className="shadow-xl border-0 dark:bg-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ข้อมูลสำหรับค้นหา</CardTitle>
            <CardDescription>ใช้ข้อมูลที่ได้รับจากร้านค้าเมื่อส่งซ่อม</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="ticket" className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  หมายเลขงานซ่อม
                </Label>
                <Input
                  id="ticket"
                  placeholder="เช่น REP-20240101-A1B2C3"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  className="uppercase placeholder:normal-case font-mono tracking-wide"
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  หมายเลขโทรศัพท์ (ที่ลงทะเบียนไว้)
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0812345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="numeric"
                  autoComplete="tel"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full gap-2" size="lg">
                <Search className="h-4 w-4" />
                ค้นหางานซ่อม
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center space-y-1">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            ข้อมูลถูกปกป้องด้วยการยืนยันหมายเลขโทรศัพท์
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            หากไม่พบข้อมูล กรุณาติดต่อร้านค้าโดยตรง
          </p>
        </div>
      </div>
    </div>
  )
}
