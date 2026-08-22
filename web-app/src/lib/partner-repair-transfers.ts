import api from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PartnerTransferStatus =
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'DEVICE_RECEIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DEVICE_RETURNED'
  | 'OWNER_RECEIVED'
  | 'CANCELLED'
  | 'RECALLED'

export interface AcceptedPartnerRelationship {
  id: string
  status: string
  initiatorTenantId: string
  partnerTenantId: string
  initiatorTenant?: { id: string; shopName: string; phone?: string }
  partnerTenant?:   { id: string; shopName: string; phone?: string }
}

export interface PartnerRepairTransfer {
  id:                 string
  status:             PartnerTransferStatus
  agreedPartnerPrice: number | null
  pricingNote:        string | null
  sharedDeviceInfo:   Record<string, unknown> | null
  sharedImageUrls:    string[] | null
  partnerWorkNote:    string | null
  partnerPartsNote:   string | null
  sentAt:             string
  acceptedAt:         string | null
  rejectedAt:         string | null
  rejectionNote:      string | null
  deviceReceivedAt:   string | null
  partnerStartedAt:   string | null
  completedAt:        string | null
  completionNote:     string | null
  returnedAt:         string | null
  ownerReceivedAt:    string | null
  cancelledAt:        string | null
  cancellationNote:   string | null
  recalledAt:         string | null
  recallNote:         string | null
  ownerTenantId?:     string
  ownerBranchId?:     string | null
  partnerTenantId:    string
  repairId:           string
  relationshipId:     string
  createdAt:          string
  updatedAt:          string
}

export interface TransferEvent {
  id:        string
  event:     string
  note:      string | null
  actorName: string | null
  actorRole: string | null
  tenantId:  string | null
  createdAt: string
}

export const TRANSFER_STATUS_LABEL: Record<PartnerTransferStatus, string> = {
  PENDING_ACCEPTANCE: 'รอ Partner รับงาน',
  ACCEPTED:           'รับงานแล้ว',
  REJECTED:           'ปฏิเสธ',
  DEVICE_RECEIVED:    'รับเครื่องแล้ว',
  IN_PROGRESS:        'กำลังซ่อม',
  COMPLETED:          'ซ่อมเสร็จแล้ว',
  DEVICE_RETURNED:    'ส่งคืนแล้ว',
  OWNER_RECEIVED:     'ร้านรับเครื่องคืนแล้ว',
  CANCELLED:          'ยกเลิกแล้ว',
  RECALLED:           'เรียกคืนแล้ว',
}

export const TERMINAL_STATUSES: PartnerTransferStatus[] = [
  'REJECTED', 'CANCELLED', 'RECALLED', 'OWNER_RECEIVED',
]

// ── API functions ─────────────────────────────────────────────────────────────

export async function getAcceptedPartners(): Promise<AcceptedPartnerRelationship[]> {
  const res = await api.get('/partner-relationships/accepted')
  return res.data
}

export async function hasAcceptedPartner(): Promise<boolean> {
  const res = await api.get('/partner-relationships/has-partner')
  return !!res.data?.hasAcceptedPartner
}

export async function getTransferByRepair(repairId: string): Promise<PartnerRepairTransfer | null> {
  try {
    const res = await api.get(`/repairs/${repairId}/partner-transfer`)
    return res.data
  } catch (err: any) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

export async function createTransfer(
  repairId: string,
  data: {
    partnerTenantId:     string
    relationshipId:      string
    agreedPartnerPrice?: number
    pricingNote?:        string
    sharedDeviceInfo?:   Record<string, unknown>
    sharedImageUrls?:    string[]
    partnerWorkNote?:    string
  },
): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/repairs/${repairId}/partner-transfer`, data)
  return res.data
}

export async function getAllTransfers(): Promise<PartnerRepairTransfer[]> {
  const res = await api.get('/partner-transfers')
  return res.data
}

export async function acceptTransfer(id: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/accept`)
  return res.data
}

export async function rejectTransfer(id: string, rejectionNote?: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/reject`, { rejectionNote })
  return res.data
}

export async function deviceReceivedTransfer(id: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/device-received`)
  return res.data
}

export async function startTransfer(id: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/start`)
  return res.data
}

export async function completeTransfer(id: string, completionNote?: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/complete`, { completionNote })
  return res.data
}

export async function returnDeviceTransfer(id: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/return-device`)
  return res.data
}

export async function ownerReceivedTransfer(id: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/owner-received`)
  return res.data
}

export async function cancelTransfer(id: string, cancellationNote?: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/cancel`, { cancellationNote })
  return res.data
}

export async function recallTransfer(id: string, recallNote?: string): Promise<PartnerRepairTransfer> {
  const res = await api.post(`/partner-transfers/${id}/recall`, { recallNote })
  return res.data
}

export async function updateTransferPrice(
  id: string,
  data: { agreedPartnerPrice?: number; pricingNote?: string },
): Promise<PartnerRepairTransfer> {
  const res = await api.patch(`/partner-transfers/${id}/price`, data)
  return res.data
}

export async function getTransferEvents(id: string): Promise<TransferEvent[]> {
  const res = await api.get(`/partner-transfers/${id}/events`)
  return res.data
}
