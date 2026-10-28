'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { renderPagesToPdf, savePdf } from '@/lib/formal-pdf'

/**
 * The report on screen as a PDF: in the app (and phone browsers) the share sheet opens to send it
 * by LINE, e-mail or Drive; on a computer the file is downloaded. Buttons and filters
 * (print:hidden, data-pdf-skip) are left out, as when printing.
 */
export function SendPdfButton({ target, filename, label = 'ส่ง PDF' }: {
  target: () => HTMLElement | null
  filename: string
  label?: string
}) {
  const [busy, setBusy] = useState(false)
  async function run() {
    const el = target()
    if (!el) return
    setBusy(true)
    try {
      const blob = await renderPagesToPdf([el], {
        skip: (node) => (node.classList?.contains('print:hidden') ?? false) || node.hasAttribute?.('data-pdf-skip'),
      })
      await savePdf(blob, filename)
    } catch (err) {
      toast.error((err as Error)?.message || 'สร้าง PDF ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
      {label}
    </Button>
  )
}
