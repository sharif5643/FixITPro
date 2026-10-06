'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Loader2, Printer, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { Platform } from '@/lib/platform'
import { FormalDocumentPage, type FormalDoc } from '@/components/formal/formal-document'
import { renderPagesToPdf, savePdf } from '@/lib/formal-pdf'

type CopyMode = 'original' | 'copy' | 'both'

/** A formal A4 document (quotation / invoice / receipt): print it, or save it as a PDF. */
export default function FormalDocumentPrintPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()
  const native  = Platform.isNative()
  const [mode, setMode] = useState<CopyMode>('original')
  const [busy, setBusy] = useState(false)
  const pagesRef = useRef<HTMLDivElement>(null)

  const { data: doc, isLoading, isError } = useQuery<FormalDoc>({
    queryKey: ['formal-document', id],
    queryFn:  async () => {
      const d = (await api.get(`/formal-documents/${id}`)).data
      return { ...d, content: { ...d.content, total: Number(d.content.total) } }
    },
    staleTime: 300_000,
  })

  useEffect(() => {
    const font = document.createElement('link')
    font.rel = 'stylesheet'
    font.href = 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap'
    const style = document.createElement('style')
    style.textContent = `
      @page { size: A4; margin: 0; }
      @media print {
        html, body { background: #fff !important; margin: 0 !important; }
        .no-print { display: none !important; }
        .formal-wrap { padding: 0 !important; gap: 0 !important; background: #fff !important; }
        .formal-page { box-shadow: none !important; break-after: page; }
      }`
    document.head.append(font, style)
    return () => { font.remove(); style.remove() }
  }, [])

  const copies: ('ต้นฉบับ' | 'สำเนา')[] = mode === 'both' ? ['ต้นฉบับ', 'สำเนา'] : mode === 'copy' ? ['สำเนา'] : ['ต้นฉบับ']

  async function handlePdf() {
    if (!doc || !pagesRef.current) return
    setBusy(true)
    try {
      await document.fonts?.ready
      const pages = Array.from(pagesRef.current.querySelectorAll<HTMLElement>('.formal-page'))
      const blob = await renderPagesToPdf(pages)
      await savePdf(blob, `${doc.number}${mode === 'copy' ? '-สำเนา' : ''}.pdf`)
    } catch (e) {
      toast.error((e as Error)?.message ?? 'สร้าง PDF ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold'
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2 shadow-sm"
        style={{ paddingTop: native ? 'calc(8px + env(safe-area-inset-top))' : undefined }}>
        {native && (
          <button onClick={() => router.back()} className={`${btn} border text-gray-700`}><ArrowLeft className="h-4 w-4" /> กลับ</button>
        )}
        <span className="mr-auto text-sm font-semibold text-gray-700">{doc ? `${doc.content.title} ${doc.number}` : 'เอกสาร'}</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as CopyMode)} className="rounded-lg border px-2 py-1.5 text-sm">
          <option value="original">ต้นฉบับ</option>
          <option value="copy">สำเนา</option>
          <option value="both">ต้นฉบับ + สำเนา</option>
        </select>
        <button onClick={handlePdf} disabled={!doc || busy} className={`${btn} bg-emerald-600 text-white disabled:opacity-50`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {native ? 'บันทึก / แชร์ PDF' : 'ดาวน์โหลด PDF'}
        </button>
        {!native && (
          <>
            <button onClick={() => window.print()} disabled={!doc} className={`${btn} bg-blue-600 text-white disabled:opacity-50`}>
              <Printer className="h-4 w-4" /> พิมพ์
            </button>
            <button onClick={() => window.close()} className={`${btn} border text-gray-700`}><X className="h-4 w-4" /> ปิด</button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-gray-500"><Loader2 className="h-6 w-6 animate-spin" /> กำลังโหลด...</div>
      ) : isError || !doc ? (
        <p className="py-24 text-center text-red-600">ไม่พบเอกสาร</p>
      ) : (
        <div className="overflow-x-auto">
          <div ref={pagesRef} className="formal-wrap mx-auto flex w-fit flex-col items-center gap-6 p-4">
            {copies.map((c) => (
              <div key={c} className="shadow-md"><FormalDocumentPage doc={doc} copy={c} /></div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
