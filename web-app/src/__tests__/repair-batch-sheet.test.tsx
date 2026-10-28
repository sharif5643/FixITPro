import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const today = new Date().toISOString()
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url === '/settings') return { data: { shopName: 'Shop', paperWidth: '58mm' } }
      return { data: [
        { id: '1', ticketNumber: 'R-1', status: 'IN_PROGRESS', receivedAt: today, estimatedTotal: 800, deposit: 200 },
        { id: '2', ticketNumber: 'R-2', status: 'RECEIVED', receivedAt: today, estimatedTotal: 500, deposit: 0 },
      ] }
    }),
  },
}))

// A default printer is saved: the flow goes straight to the preview, as on the single repair slip
const printHtml = vi.fn(async (_: { html: string; printerId: string; jobName: string }) => ({ success: true }))
vi.mock('@/lib/sunmi-printer', () => ({
  SunmiPrinter: {
    getDefaultPrinter:    async () => ({ printerId: 'p1', printerName: 'Sunmi' }),
    getAvailablePrinters: async () => ({ printers: [{ id: 'p1', name: 'Sunmi', available: true }] }),
    setDefaultPrinter:    async () => ({}),
    printHtml:            (o: { html: string; printerId: string; jobName: string }) => printHtml(o),
  },
}))
vi.mock('@/components/sunmi/printer-flow', () => ({
  PrinterPickerStep: () => <div data-testid="picker" />,
}))

import { RepairBatchPrintSheet } from '@/components/repairs/repair-batch-print'

function renderSheet() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RepairBatchPrintSheet customer={{ id: 'c1', name: 'ร้านส่ง A', phone: '0812345678' }} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('app print flow for the combined slip (same steps as the single repair slip)', () => {
  beforeEach(() => printHtml.mockClear())

  it('shows the same choices: which devices, shop / customer / both copies, 58 / 80 mm', async () => {
    renderSheet()
    await waitFor(() => expect(screen.getByText('พิมพ์ใบรับเครื่องรวม')).toBeTruthy())
    expect(screen.getByText('Sunmi')).toBeTruthy()
    expect(screen.getByText('งานค้างทั้งหมด')).toBeTruthy()
    expect(screen.getByText(/พิมพ์ของร้าน/)).toBeTruthy()
    expect(screen.getByText(/พิมพ์ลูกค้า/)).toBeTruthy()
    expect(screen.getByText(/พิมพ์ 2 ฉบับ/)).toBeTruthy()
    expect(screen.getByText('58mm')).toBeTruthy()
    expect(screen.getByText('80mm')).toBeTruthy()
  })

  it('prints both copies with a cut line by default, then says it printed', async () => {
    renderSheet()
    await waitFor(() => expect(screen.getByText('พิมพ์ใบรับเครื่องรวม')).toBeTruthy())
    await waitFor(() => expect((screen.getByRole('button', { name: /^พิมพ์$/ }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /^พิมพ์$/ }))
    await waitFor(() => expect(screen.getByText('พิมพ์สำเร็จ!')).toBeTruthy())
    const { html, printerId } = printHtml.mock.calls[0][0]
    expect(printerId).toBe('p1')
    expect(html).toContain('[ฉบับร้าน]')
    expect(html).toContain('[ฉบับลูกค้า]')
    expect(html).toContain('ตัดที่นี่')
    expect(html).toContain('R-1')
    expect(html).toContain('คงเหลือ ฿600')
  })

  it('prints only the customer copy of the open jobs on 80mm when chosen', async () => {
    renderSheet()
    await waitFor(() => expect(screen.getByText('งานค้างทั้งหมด')).toBeTruthy())
    fireEvent.click(screen.getByText('งานค้างทั้งหมด'))
    fireEvent.click(screen.getByText(/พิมพ์ลูกค้า/))
    fireEvent.click(screen.getByText('80mm'))
    expect(screen.getByText('พิมพ์สรุปงานซ่อมค้าง')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^พิมพ์$/ }))
    await waitFor(() => expect(printHtml).toHaveBeenCalled())
    const { html, jobName } = printHtml.mock.calls[0][0]
    expect(html).toContain('[ฉบับลูกค้า]')
    expect(html).not.toContain('[ฉบับร้าน]')
    expect(html).toContain('width: 576px')
    expect(jobName).toContain('สรุปงานซ่อมค้าง')
  })
})
