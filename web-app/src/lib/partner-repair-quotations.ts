import api from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuotationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'COUNTER_OFFER'
  | 'EXPIRED'
  | 'CANCELLED'

export interface PartnerRepairQuotation {
  id:                 string
  version:            number
  status:             QuotationStatus
  proposedAmount:     string | number
  currency:           string
  note:               string | null
  respondedAt:        string | null
  expiresAt:          string | null
  createdAt:          string
  updatedAt:          string
  transferId:         string
  proposedByTenantId: string
  proposedByUserId:   string
  respondedByUserId:  string | null
}

export interface QuotationEvent {
  id:          string
  event:       string
  amount:      string | number | null
  note:        string | null
  actorId:     string | null
  actorName:   string | null
  tenantId:    string | null
  createdAt:   string
  quotationId: string
}

// ── Status display ────────────────────────────────────────────────────────────

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  PENDING:       'รอการตอบรับ',
  ACCEPTED:      'ตกลงราคาแล้ว',
  REJECTED:      'ปฏิเสธ',
  COUNTER_OFFER: 'เสนอราคาตอบกลับ',
  EXPIRED:       'หมดอายุ',
  CANCELLED:     'ยกเลิก',
}

export const QUOTATION_TERMINAL_STATUSES: QuotationStatus[] = [
  'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED',
]

export function isQuotationTerminal(status: QuotationStatus): boolean {
  return QUOTATION_TERMINAL_STATUSES.includes(status)
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function createQuotation(
  transferId: string,
  payload: { amount: number; note?: string },
): Promise<PartnerRepairQuotation> {
  const res = await api.post(`/partner-transfers/${transferId}/quotations`, payload)
  return res.data
}

export async function getQuotations(transferId: string): Promise<PartnerRepairQuotation[]> {
  const res = await api.get(`/partner-transfers/${transferId}/quotations`)
  return res.data
}

export async function getActiveQuotation(
  transferId: string,
): Promise<PartnerRepairQuotation | null> {
  const res = await api.get(`/partner-transfers/${transferId}/quotations/active`)
  return res.data
}

export async function acceptQuotation(quotationId: string): Promise<PartnerRepairQuotation> {
  const res = await api.post(`/partner-quotations/${quotationId}/accept`)
  return res.data
}

export async function rejectQuotation(
  quotationId: string,
  note?: string,
): Promise<PartnerRepairQuotation> {
  const res = await api.post(`/partner-quotations/${quotationId}/reject`, { note })
  return res.data
}

export async function counterQuotation(
  quotationId: string,
  payload: { amount: number; note?: string },
): Promise<PartnerRepairQuotation> {
  const res = await api.post(`/partner-quotations/${quotationId}/counter`, payload)
  return res.data
}

export async function getQuotationEvents(quotationId: string): Promise<QuotationEvent[]> {
  const res = await api.get(`/partner-quotations/${quotationId}/events`)
  return res.data
}
