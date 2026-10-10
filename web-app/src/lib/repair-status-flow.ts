/**
 * Which status a repair may move to by a plain status change — the same map the API enforces
 * (backend/src/repairs/repairs.service.ts, update()). DELIVERED only comes from taking payment;
 * QC_PENDING → COMPLETED only from the QC check (POST /repairs/:id/qc).
 */
export const STATUS_MOVES: Record<string, string[]> = {
  RECEIVED:         ['DIAGNOSING'],
  DIAGNOSING:       ['WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'],
  WAITING_APPROVAL: ['APPROVED'],
  APPROVED:         ['WAITING_PARTS', 'IN_PROGRESS'],
  WAITING_PARTS:    ['IN_PROGRESS'],
  IN_PROGRESS:      ['WAITING_APPROVAL', 'QC_PENDING', 'WAITING_PARTS', 'COMPLETED'],
  QC_PENDING:       ['IN_PROGRESS'],
  COMPLETED:        ['READY_PICKUP'],
  READY_PICKUP:     [],
}

export function canMoveRepair(from: string, to: string): boolean {
  if (from === to || from === 'DELIVERED' || from === 'CANCELLED') return false
  if (to === 'CANCELLED') return true
  return (STATUS_MOVES[from] ?? []).includes(to)
}

/** The statuses a person can pick for a repair now (its current one first). */
export function statusChoices(from: string): string[] {
  if (from === 'DELIVERED' || from === 'CANCELLED') return [from]
  return [from, ...(STATUS_MOVES[from] ?? []), 'CANCELLED']
}

/** The usual next step of a job as one button (web, staff app and SUNMI use the same). */
export const NEXT_ACTION: Record<string, { to: string; label: string }> = {
  RECEIVED:      { to: 'DIAGNOSING',   label: 'เริ่มตรวจเช็ค' },
  DIAGNOSING:    { to: 'IN_PROGRESS',  label: 'เริ่มซ่อม' },
  APPROVED:      { to: 'IN_PROGRESS',  label: 'เริ่มซ่อม' },
  WAITING_PARTS: { to: 'IN_PROGRESS',  label: 'อะไหล่มาแล้ว — เริ่มซ่อม' },
  IN_PROGRESS:   { to: 'COMPLETED',    label: 'ซ่อมเสร็จ' },
  COMPLETED:     { to: 'READY_PICKUP', label: 'แจ้งลูกค้ามารับเครื่อง' },
}

/** "Done now" for a quick job: the steps the API requires, taken one after another. */
export const PATH_TO_DONE: Record<string, string[]> = {
  RECEIVED:      ['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED'],
  DIAGNOSING:    ['IN_PROGRESS', 'COMPLETED'],
  APPROVED:      ['IN_PROGRESS', 'COMPLETED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED'],
}
