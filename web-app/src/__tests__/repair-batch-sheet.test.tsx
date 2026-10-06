import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
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
vi.mock('@/components/sunmi/printer-flow', () => ({
  PrinterFlowSheet: ({ receiptHtml, previewData }: { receiptHtml: string; previewData: { title: string } }) => (
    <div data-testid="flow" data-title={previewData.title}>{receiptHtml}</div>
  ),
}))

import { RepairBatchPrintSheet } from '@/components/repairs/repair-batch-print'

describe('app print sheet for the combined slip', () => {
  it('offers the day and open-jobs slips, then prints the chosen one', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RepairBatchPrintSheet customer={{ id: 'c1', name: 'ร้านส่ง A', phone: '0812345678' }} onClose={() => {}} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText(/เครื่องที่รับวันที่ .* — 2 เครื่อง/)).toBeTruthy())
    expect(screen.getByText(/ยังค้างจ่าย — 2 เครื่อง/)).toBeTruthy()
    fireEvent.click(screen.getByText('ใบรับเครื่องรวม'))
    const flow = await screen.findByTestId('flow')
    expect(flow.getAttribute('data-title')).toBe('ใบรับเครื่องรวม')
    expect(flow.textContent).toContain('R-1')
    expect(flow.textContent).toContain('คงเหลือ ฿600')
  })
})
