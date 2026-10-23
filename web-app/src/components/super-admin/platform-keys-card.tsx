'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Save, Loader2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/api'

type Source = 'env' | 'web' | null
type Key = 'LINE_OA_ID' | 'LINE_CHANNEL_SECRET' | 'LINE_CHANNEL_ACCESS_TOKEN' | 'ANTHROPIC_API_KEY'
interface KeysStatus { keys: Record<Key, Source>; webhookUrl: string }

const FIELDS: { key: Key; label: string; hint: string; secret: boolean }[] = [
  { key: 'LINE_OA_ID', label: 'LINE OA ID', hint: 'เช่น @fixitpro', secret: false },
  { key: 'LINE_CHANNEL_SECRET', label: 'Channel secret', hint: 'LINE Developers → Messaging API channel → Basic settings', secret: true },
  { key: 'LINE_CHANNEL_ACCESS_TOKEN', label: 'Channel access token (long-lived)', hint: 'Messaging API → Issue', secret: true },
  { key: 'ANTHROPIC_API_KEY', label: 'คีย์ AI สำหรับอ่านรูปหน้าจอแอปค่าย (ไม่บังคับ)', hint: 'console.anthropic.com → API keys', secret: true },
]

const sourceText = (s: Source) => (s === 'env' ? 'ตั้งค่าบนเซิร์ฟเวอร์แล้ว' : s === 'web' ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้ง')

/**
 * FixITPro's LINE account (customers follow repairs, staff report SIM sales) and the AI key for
 * reading carrier screenshots. Values are write-only: the page only shows whether each is set.
 */
export function PlatformKeysCard() {
  const qc = useQueryClient()
  const [values, setValues] = useState<Partial<Record<Key, string>>>({})
  const { data } = useQuery<KeysStatus>({
    queryKey: ['sa-platform-keys'],
    queryFn: () => api.get('/super-admin/settings/platform-keys').then((r) => r.data),
  })
  const save = useMutation({
    mutationFn: (body: Partial<Record<Key, string>>) => api.patch('/super-admin/settings/platform-keys', body),
    onSuccess: () => { toast.success('บันทึกแล้ว'); setValues({}); qc.invalidateQueries({ queryKey: ['sa-platform-keys'] }) },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })
  const typed = Object.fromEntries(Object.entries(values).filter(([, v]) => v?.trim())) as Partial<Record<Key, string>>
  const lineReady = !!data && (['LINE_OA_ID', 'LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN'] as Key[]).every((k) => data.keys[k])

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden lg:col-span-2">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-green-400" />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">LINE ของระบบ</p>
          <p className="text-slate-500 text-xs">ลูกค้าติดตามงานซ่อม · พนักงานบันทึกขายซิม/เน็ตทาง LINE</p>
        </div>
        <span className={`text-xs font-semibold ${lineReady ? 'text-green-400' : 'text-amber-300'}`}>{lineReady ? 'พร้อมใช้งาน' : 'ยังไม่พร้อม'}</span>
      </div>
      <div className="p-5 space-y-4">
        {data && (
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Webhook URL (วางใน LINE Developers → Messaging API → Webhook URL แล้วเปิด Use webhook)</Label>
            <div className="flex gap-2">
              <Input readOnly value={data.webhookUrl} className="bg-slate-800 border-slate-700 text-white text-sm" />
              <Button size="sm" variant="ghost" className="text-slate-300" onClick={() => { navigator.clipboard?.writeText(data.webhookUrl); toast.success('คัดลอกแล้ว') }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {FIELDS.map((f) => {
          const src = data?.keys[f.key] ?? null
          return (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-slate-400 text-xs">{f.label}</Label>
                <span className={`text-xs ${src ? 'text-green-400' : 'text-slate-500'}`}>{sourceText(src)}</span>
              </div>
              <div className="flex gap-2">
                <Input
                  type={f.secret ? 'password' : 'text'}
                  autoComplete="off"
                  value={values[f.key] ?? ''}
                  disabled={src === 'env'}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={src ? 'วางค่าใหม่เพื่อเปลี่ยน' : f.hint}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
                {src === 'web' && (
                  <Button size="sm" variant="ghost" className="text-red-300 hover:text-red-200 shrink-0"
                    onClick={() => save.mutate({ [f.key]: '' })} disabled={save.isPending}>ลบ</Button>
                )}
              </div>
              {src && <p className="text-[11px] text-slate-500">{f.hint}</p>}
            </div>
          )
        })}
        <Button size="sm" onClick={() => save.mutate(typed)} disabled={save.isPending || !Object.keys(typed).length} className="bg-violet-600 hover:bg-violet-700">
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          บันทึก
        </Button>
      </div>
    </div>
  )
}
