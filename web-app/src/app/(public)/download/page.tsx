'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Download, Smartphone, Monitor, Printer, ShieldCheck, Apple, CheckCircle2, Loader2 } from 'lucide-react'

// Written by .github/workflows/android-apps.yml next to the APKs
interface AppMeta { file: string; version: string; versionCode: number; size: number; sha256: string }
interface AppsJson { builtAt: string; commit: string; pos: AppMeta; staff: AppMeta }

const SITE = 'https://fixitpro.in.th'

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Chrome/Edge offer to install the site as an app; keep the event to trigger it from a button. */
function useInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e) }
    const onInstalled = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  return { canInstall: !!prompt, installed, install: async () => { await prompt?.prompt(); setPrompt(null) } }
}

function ApkCard({ title, subtitle, icon: Icon, meta, loading, points }: {
  title: string; subtitle: string; icon: typeof Smartphone; meta?: AppMeta; loading: boolean; points: string[]
}) {
  const url = meta ? `/downloads/${meta.file}?v=${meta.versionCode}` : null
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0">
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <ul className="space-y-1.5 mb-5 text-sm text-slate-600">
        {points.map((p) => (
          <li key={p} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />{p}</li>
        ))}
      </ul>
      <div className="mt-auto">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : url && meta ? (
          <div className="flex items-center gap-4">
            <div className="hidden sm:block rounded-xl border border-slate-200 p-2 bg-white">
              <QRCodeSVG value={`${SITE}${url}`} size={96} level="M" />
            </div>
            <div className="flex-1 space-y-2">
              <a href={url} download
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600">
                <Download className="h-5 w-5" /> ดาวน์โหลด APK
              </a>
              <p className="text-xs text-slate-400 text-center">เวอร์ชัน {meta.version} · {mb(meta.size)}</p>
              <p className="hidden sm:block text-xs text-slate-400 text-center">หรือสแกน QR ด้วยเครื่องที่จะติดตั้ง</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-3 text-center">กำลังเตรียมไฟล์แอป — ใช้แบบติดตั้งจากเว็บด้านล่างไปก่อนได้</p>
        )}
      </div>
    </div>
  )
}

export default function DownloadPage() {
  const [apps, setApps] = useState<AppsJson | null>(null)
  const [loading, setLoading] = useState(true)
  const { canInstall, installed, install } = useInstallPrompt()

  useEffect(() => {
    fetch('/downloads/apps.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setApps(d && d.pos && d.staff ? d : null))
      .catch(() => setApps(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 pt-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 space-y-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">ดาวน์โหลดแอป FixITPro</h1>
          <p className="text-slate-500 mt-2">ใช้บัญชีเดียวกับหน้าเว็บ ข้อมูลตรงกันทุกเครื่อง อัปเดตฟีเจอร์ใหม่ให้อัตโนมัติ</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <ApkCard
            title="FixITPro POS"
            subtitle="เครื่อง SUNMI และแท็บเล็ตหน้าร้าน (Android)"
            icon={Printer}
            meta={apps?.pos}
            loading={loading}
            points={['ขายสินค้า รับซ่อม ขายซิม/แพ็กเกจ', 'พิมพ์ใบเสร็จจากเครื่องพิมพ์ในตัว SUNMI', 'สแกนบาร์โค้ดด้วยกล้อง/หัวสแกน']}
          />
          <ApkCard
            title="FixITPro Staff"
            subtitle="มือถือพนักงานและเจ้าของร้าน (Android)"
            icon={Smartphone}
            meta={apps?.staff}
            loading={loading}
            points={['ดูและอัปเดตงานซ่อม แชทในร้าน', 'ขายหน้าร้าน ดูสต็อก ดูรายงาน', 'รับแจ้งเตือนงานใหม่']}
          />
        </div>

        {/* Install the website as an app: iPhone, computers, any Android without the APK */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
              <Monitor className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-slate-900">ติดตั้งจากเว็บ (ไม่ต้องดาวน์โหลดไฟล์)</h2>
              <p className="text-sm text-slate-500">สำหรับคอมพิวเตอร์ แท็บเล็ต iPhone และ Android ทุกรุ่น — ได้ไอคอนบนหน้าจอ เปิดแบบเต็มจอเหมือนแอป</p>
            </div>
            {installed ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4" />ติดตั้งแล้ว</span>
            ) : canInstall ? (
              <button onClick={install} className="shrink-0 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800">ติดตั้งเลย</button>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-3 text-sm text-slate-600">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5"><Monitor className="h-4 w-4" />คอมพิวเตอร์ (Chrome / Edge)</p>
              เปิด fixitpro.in.th แล้วกดไอคอน “ติดตั้ง” ที่ช่องที่อยู่เว็บด้านขวา หรือเมนู ⋮ → “ติดตั้ง FixITPro”
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5"><Smartphone className="h-4 w-4" />Android (Chrome)</p>
              เปิด fixitpro.in.th → เมนู ⋮ → “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5"><Apple className="h-4 w-4" />iPhone / iPad (Safari)</p>
              เปิด fixitpro.in.th ใน Safari → ปุ่มแชร์ (สี่เหลี่ยมมีลูกศร) → “เพิ่มไปยังหน้าจอโฮม”
            </div>
          </div>
        </div>

        {/* How to install an APK */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />วิธีติดตั้งไฟล์ APK บน Android / SUNMI
          </h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-slate-600">
            <li>กด “ดาวน์โหลด APK” บนเครื่องที่จะติดตั้ง (หรือสแกน QR จากหน้านี้บนคอมพิวเตอร์)</li>
            <li>เปิดไฟล์ที่ดาวน์โหลด — ถ้าเครื่องถาม ให้กด “ตั้งค่า” แล้วเปิด “อนุญาตจากแหล่งที่มานี้”</li>
            <li>กด “ติดตั้ง” แล้วเปิดแอป เข้าสู่ระบบด้วยบัญชีเดิม</li>
            <li>มีเวอร์ชันใหม่: ดาวน์โหลดจากหน้านี้แล้วติดตั้งทับได้เลย ข้อมูลไม่หาย</li>
          </ol>
          {apps && (
            <p className="text-xs text-slate-400 mt-4">
              อัปเดตล่าสุด {new Date(apps.builtAt).toLocaleString('th-TH')} · SHA-256 POS {apps.pos.sha256.slice(0, 12)}… · Staff {apps.staff.sha256.slice(0, 12)}…
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
