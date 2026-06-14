'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Shield, Bell, Globe, Database, Save, Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/api'
import type { SystemSettings } from '@/types'
import { cn } from '@/lib/utils'

function ReadOnlyRow({ label, value }: { label: string; value: string | boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-slate-200 font-mono text-xs">
        {typeof value === 'boolean' ? (value ? 'true' : 'false') : value}
      </span>
    </div>
  )
}

export default function SettingsPage() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<SystemSettings>({
    queryKey: ['sa-settings'],
    queryFn: () => api.get('/super-admin/settings').then((r) => r.data),
  })

  // Editable shop fields
  const [shopName,    setShopName]    = useState('')
  const [shopPhone,   setShopPhone]   = useState('')
  const [shopEmail,   setShopEmail]   = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [taxId,       setTaxId]       = useState('')
  const [editing,     setEditing]     = useState(false)

  const startEdit = () => {
    if (!data?.shop) return
    setShopName(data.shop.shopName ?? '')
    setShopPhone(data.shop.shopPhone ?? '')
    setShopEmail(data.shop.shopEmail ?? '')
    setShopAddress(data.shop.shopAddress ?? '')
    setTaxId(data.shop.taxId ?? '')
    setEditing(true)
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/super-admin/settings', {
        shopName:    shopName    || undefined,
        shopPhone:   shopPhone   || undefined,
        shopEmail:   shopEmail   || undefined,
        shopAddress: shopAddress || undefined,
        taxId:       taxId       || undefined,
      }),
    onSuccess: () => {
      toast.success('บันทึกการตั้งค่าสำเร็จ')
      qc.invalidateQueries({ queryKey: ['sa-settings'] })
      setEditing(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Settings</h1>
          <p className="text-slate-400 text-sm mt-0.5">การตั้งค่าระดับแพลตฟอร์ม</p>
        </div>
        {data.shop && !editing && (
          <Button size="sm" onClick={startEdit} className="bg-violet-600 hover:bg-violet-700">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            แก้ไขข้อมูลร้าน
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Platform */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <Globe className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Platform</p>
              <p className="text-slate-500 text-xs">ข้อมูลพื้นฐานของแพลตฟอร์ม</p>
            </div>
          </div>
          <div className="divide-y divide-slate-800/50">
            <ReadOnlyRow label="Platform Name"    value={data.platform.name} />
            <ReadOnlyRow label="Version"          value={data.platform.version} />
            <ReadOnlyRow label="Environment"      value={data.platform.environment} />
            <ReadOnlyRow label="Default Timezone" value={data.platform.timezone} />
            <ReadOnlyRow label="Default Language" value={data.platform.language} />
          </div>
        </div>

        {/* Security */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <Shield className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Security</p>
              <p className="text-slate-500 text-xs">การตั้งค่าความปลอดภัย</p>
            </div>
          </div>
          <div className="divide-y divide-slate-800/50">
            <ReadOnlyRow label="Session Timeout"  value={data.security.jwtExpiresIn} />
            <ReadOnlyRow label="Cookie Mode"      value={data.security.cookieMode} />
            <ReadOnlyRow label="SameSite"         value={data.security.cookieSameSite} />
            <ReadOnlyRow label="Cookie Secure"    value={data.security.cookieSecure} />
            <ReadOnlyRow label="CORS Origins"     value={data.security.corsOrigins} />
          </div>
        </div>

        {/* Database */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <Database className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Database</p>
              <p className="text-slate-500 text-xs">ข้อมูล database connection (read only)</p>
            </div>
          </div>
          <div className="divide-y divide-slate-800/50">
            <ReadOnlyRow label="Provider" value={data.database.provider} />
            <ReadOnlyRow label="ORM"      value={data.database.orm} />
            <ReadOnlyRow label="Host"     value={data.database.host} />
            <ReadOnlyRow label="DB Name"  value={data.database.name} />
          </div>
        </div>

        {/* Shop Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <Settings className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Shop Settings</p>
              <p className="text-slate-500 text-xs">ข้อมูลพื้นฐานของร้าน</p>
            </div>
          </div>

          {!data.shop ? (
            <div className="px-5 py-6 text-center">
              <p className="text-slate-500 text-sm">ไม่พบข้อมูล ShopSettings (row id=1)</p>
            </div>
          ) : editing ? (
            <div className="p-5 space-y-4">
              {([
                { label: 'ชื่อร้าน',  value: shopName,    set: setShopName },
                { label: 'เบอร์โทร',  value: shopPhone,   set: setShopPhone },
                { label: 'อีเมล',     value: shopEmail,   set: setShopEmail },
                { label: 'ที่อยู่',   value: shopAddress, set: setShopAddress },
                { label: 'เลขผู้เสียภาษี', value: taxId, set: setTaxId },
              ] as const).map(({ label, value, set }) => (
                <div key={label} className="space-y-1.5">
                  <Label className="text-slate-400 text-xs">{label}</Label>
                  <Input
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="ghost"
                  onClick={() => setEditing(false)}
                  className="text-slate-400 hover:text-white">
                  ยกเลิก
                </Button>
                <Button size="sm"
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="bg-violet-600 hover:bg-violet-700">
                  {mutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  บันทึก
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              <ReadOnlyRow label="ชื่อร้าน"          value={data.shop.shopName ?? '—'} />
              <ReadOnlyRow label="เบอร์โทร"          value={data.shop.shopPhone ?? '—'} />
              <ReadOnlyRow label="อีเมล"             value={data.shop.shopEmail ?? '—'} />
              <ReadOnlyRow label="Paper Width"       value={data.shop.paperWidth} />
              <ReadOnlyRow label="VAT %"             value={`${data.shop.vatPercent}%`} />
              <ReadOnlyRow label="Low Stock Alert"   value={`${data.shop.lowStockAlert} ชิ้น`} />
              <ReadOnlyRow label="Auto SKU"          value={data.shop.autoGenerateSku} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
