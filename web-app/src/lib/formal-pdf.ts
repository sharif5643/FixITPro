import { Capacitor } from '@capacitor/core'
import { Platform } from '@/lib/platform'

/**
 * A4 PDF from the rendered document pages. Each page element is drawn to an image (Thai text
 * renders exactly as on screen) and long pages are cut into A4 sheets.
 */
export async function renderPagesToPdf(pages: HTMLElement[]): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')])
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  let first = true
  for (const el of pages) {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
    const sheetPx = Math.ceil(canvas.width * 297 / 210)
    // a few pixels over one sheet (rounding, borders) stays on that sheet
    const sheets = Math.max(1, Math.ceil((canvas.height - 16) / sheetPx))
    for (let i = 0, y = 0; i < sheets; i++, y += sheetPx) {
      const h = i === sheets - 1 ? canvas.height - y : sheetPx
      const part = document.createElement('canvas')
      part.width = canvas.width
      part.height = h
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
      if (!first) pdf.addPage()
      first = false
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, Math.min(297, h * 210 / canvas.width))
    }
  }
  return pdf.output('blob')
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Web: download the file. App: save it and open the share sheet (LINE, e-mail, Drive, files). */
export async function savePdf(blob: Blob, filename: string): Promise<void> {
  if (Platform.isNative()) {
    if (!Capacitor.isPluginAvailable('Filesystem') || !Capacitor.isPluginAvailable('Share')) {
      throw new Error('แอปเวอร์ชันนี้ยังบันทึก PDF ไม่ได้ — กรุณาอัปเดตแอป หรือเปิดเอกสารนี้บนเว็บ')
    }
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const saved = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache })
    await Share.share({ title: filename, url: saved.uri, dialogTitle: 'บันทึก / ส่งต่อ PDF' })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
