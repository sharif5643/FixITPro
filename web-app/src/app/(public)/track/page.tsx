'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Wrench, Phone } from 'lucide-react'
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

    // Pass phone as query param — the detail page uses it to verify
    router.push(`/track/${encodeURIComponent(t)}?phone=${encodeURIComponent(p)}`)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-lg">
              <Wrench className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">ติดตามงานซ่อม</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            กรอกหมายเลขงานซ่อมและเบอร์โทรที่ลงทะเบียนไว้
          </p>
        </div>

        <Card className="shadow-xl border-0 dark:bg-slate-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">ข้อมูลสำหรับค้นหา</CardTitle>
            <CardDescription>ใช้ข้อมูลที่ได้รับเมื่อส่งซ่อม</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ticket">หมายเลขงานซ่อม</Label>
                <Input
                  id="ticket"
                  placeholder="เช่น REP-20240101-A1B2C3"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  className="uppercase placeholder:normal-case"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">
                  <Phone className="inline h-3.5 w-3.5 mr-1" />
                  หมายเลขโทรศัพท์
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0812345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <Button type="submit" className="w-full gap-2">
                <Search className="h-4 w-4" />
                ค้นหางานซ่อม
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          หากไม่พบข้อมูล กรุณาติดต่อร้านค้าโดยตรง
        </p>
      </div>
    </div>
  )
}
