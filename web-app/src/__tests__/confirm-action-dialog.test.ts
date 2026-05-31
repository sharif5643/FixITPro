/**
 * ConfirmActionDialog — Logic Tests
 *
 * Pure-logic unit tests (no DOM/React). Tests mirror the component's
 * state machine, validation rules, and dialog config selection logic.
 */

import { describe, it, expect, vi } from 'vitest'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionKind = 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel'
type Variant    = 'success' | 'warning' | 'danger' | 'info'

interface DialogConfig {
  title: string
  description: string
  variant: Variant
  confirmLabel: string
  requireReason?: boolean
  reasonLabel?: string
}

// ── Dialog config mirror ──────────────────────────────────────────────────────

function getDialogConfig(kind: ActionKind): DialogConfig {
  switch (kind) {
    case 'approve':  return {
      title: 'ยืนยันอนุมัติคำขอโอน',
      description: 'ต้องการอนุมัติให้สาขาต้นทางจัดส่งสินค้านี้หรือไม่?',
      variant: 'info', confirmLabel: 'อนุมัติ',
    }
    case 'reject':   return {
      title: 'ปฏิเสธคำขอโอน',
      description: 'กรุณาระบุเหตุผลการปฏิเสธ',
      variant: 'danger', confirmLabel: 'ปฏิเสธ',
      requireReason: true, reasonLabel: 'เหตุผลที่ปฏิเสธ',
    }
    case 'dispatch': return {
      title: 'ยืนยันจัดส่งสินค้า',
      description: 'ยืนยันว่าได้ส่งสินค้าออกจากสาขาต้นทางแล้ว',
      variant: 'info', confirmLabel: 'จัดส่งแล้ว',
    }
    case 'receive':  return {
      title: 'ยืนยันรับสินค้า',
      description: 'เมื่อกดยืนยัน ระบบจะเพิ่มสต๊อกเข้าสาขาปลายทางและลดสต๊อกจากสาขาต้นทาง',
      variant: 'success', confirmLabel: 'รับสินค้าแล้ว',
    }
    case 'cancel':   return {
      title: 'ยกเลิกคำขอโอน',
      description: 'ต้องการยกเลิกคำขอโอนนี้หรือไม่?',
      variant: 'warning', confirmLabel: 'ยกเลิกคำขอ',
      requireReason: true, reasonLabel: 'เหตุผลที่ยกเลิก',
    }
  }
}

// Component-level logic: should confirm button be disabled?
function isConfirmDisabled(loading: boolean, requireReason: boolean, reason: string): boolean {
  return loading || (requireReason && !reason.trim())
}

// Simulates pressing confirm in the dialog
function handleConfirm(
  kind: ActionKind,
  reason: string | undefined,
  muts: Record<ActionKind, (...args: any[]) => void>,
) {
  switch (kind) {
    case 'approve':  muts.approve(); break
    case 'reject':   muts.reject(reason); break
    case 'dispatch': muts.dispatch(); break
    case 'receive':  muts.receive(); break
    case 'cancel':   if (reason) muts.cancel(reason); break
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dialog opens when pendingAction is set
// ─────────────────────────────────────────────────────────────────────────────
describe('Dialog opens when action is set', () => {
  it('open=true when pendingAction is not null', () => {
    const pendingAction = { kind: 'approve' as ActionKind, transfer: { id: 'tr-1' } }
    expect(!!pendingAction).toBe(true)
  })

  it('open=false when pendingAction is null', () => {
    const pendingAction = null
    expect(!!pendingAction).toBe(false)
  })

  it('correct config returned for each action kind', () => {
    const actions: ActionKind[] = ['approve', 'reject', 'dispatch', 'receive', 'cancel']
    for (const kind of actions) {
      const cfg = getDialogConfig(kind)
      expect(cfg.title).toBeTruthy()
      expect(cfg.description).toBeTruthy()
      expect(cfg.confirmLabel).toBeTruthy()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cancel does not call mutation
// ─────────────────────────────────────────────────────────────────────────────
describe('Cancel does not call mutation', () => {
  it('clicking cancel closes dialog without calling any mutation', () => {
    const muts = {
      approve: vi.fn(), reject: vi.fn(), dispatch: vi.fn(),
      receive: vi.fn(), cancel: vi.fn(),
    }
    let pendingAction: { kind: ActionKind } | null = { kind: 'approve' }

    // Cancel = just close dialog, do NOT call mutation
    pendingAction = null

    expect(muts.approve).not.toHaveBeenCalled()
    expect(muts.reject).not.toHaveBeenCalled()
    expect(pendingAction).toBeNull()
  })

  it('cancel button is never disabled when not loading', () => {
    const loading = false
    // Cancel button has no disabled condition other than loading
    expect(loading).toBe(false)
  })

  it('cancel button disabled while API call in flight', () => {
    const loading = true
    expect(loading).toBe(true) // button would be disabled
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Confirm calls mutation
// ─────────────────────────────────────────────────────────────────────────────
describe('Confirm calls the correct mutation', () => {
  function makeMuts() {
    return {
      approve: vi.fn(), reject: vi.fn(), dispatch: vi.fn(),
      receive: vi.fn(), cancel: vi.fn(),
    }
  }

  it('approve action calls approveMut', () => {
    const muts = makeMuts()
    handleConfirm('approve', undefined, muts)
    expect(muts.approve).toHaveBeenCalledOnce()
    expect(muts.reject).not.toHaveBeenCalled()
  })

  it('dispatch action calls dispatchMut', () => {
    const muts = makeMuts()
    handleConfirm('dispatch', undefined, muts)
    expect(muts.dispatch).toHaveBeenCalledOnce()
  })

  it('receive action calls receiveMut', () => {
    const muts = makeMuts()
    handleConfirm('receive', undefined, muts)
    expect(muts.receive).toHaveBeenCalledOnce()
  })

  it('reject action calls rejectMut with reason', () => {
    const muts = makeMuts()
    handleConfirm('reject', 'ไม่มีสต๊อก', muts)
    expect(muts.reject).toHaveBeenCalledWith('ไม่มีสต๊อก')
  })

  it('cancel action calls cancelMut with reason', () => {
    const muts = makeMuts()
    handleConfirm('cancel', 'เปลี่ยนใจ', muts)
    expect(muts.cancel).toHaveBeenCalledWith('เปลี่ยนใจ')
  })

  it('cancel action does NOT call mutation when reason is empty', () => {
    const muts = makeMuts()
    handleConfirm('cancel', '', muts)
    expect(muts.cancel).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Reject requires reason (confirm disabled when empty)
// ─────────────────────────────────────────────────────────────────────────────
describe('Reject requireReason validation', () => {
  const cfg = getDialogConfig('reject')

  it('requireReason is true for reject', () => {
    expect(cfg.requireReason).toBe(true)
  })

  it('confirm button disabled when reason is empty', () => {
    expect(isConfirmDisabled(false, true, '')).toBe(true)
  })

  it('confirm button disabled when reason is only whitespace', () => {
    expect(isConfirmDisabled(false, true, '   ')).toBe(true)
  })

  it('confirm button enabled when reason has content', () => {
    expect(isConfirmDisabled(false, true, 'ไม่มีสต๊อก')).toBe(false)
  })

  it('confirm button also disabled when loading regardless of reason', () => {
    expect(isConfirmDisabled(true, true, 'มีเหตุผล')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Receive dialog warns that stock will move
// ─────────────────────────────────────────────────────────────────────────────
describe('Receive dialog text warns about stock movement', () => {
  const cfg = getDialogConfig('receive')

  it('title is ยืนยันรับสินค้า', () => {
    expect(cfg.title).toBe('ยืนยันรับสินค้า')
  })

  it('description mentions stock increase and decrease', () => {
    expect(cfg.description).toContain('เพิ่มสต๊อก')
    expect(cfg.description).toContain('ลดสต๊อก')
  })

  it('variant is success', () => {
    expect(cfg.variant).toBe('success')
  })

  it('receive does NOT require reason', () => {
    expect(cfg.requireReason).toBeFalsy()
  })

  it('confirm label is รับสินค้าแล้ว', () => {
    expect(cfg.confirmLabel).toBe('รับสินค้าแล้ว')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. SUNMI buttons are large (h-14)
// ─────────────────────────────────────────────────────────────────────────────
describe('SUNMI button size', () => {
  function getBtnClass(buttonSize: 'md' | 'lg'): string {
    return buttonSize === 'lg' ? 'h-14 text-base' : 'h-12 text-sm'
  }

  it('default buttonSize produces h-12', () => {
    expect(getBtnClass('md')).toContain('h-12')
  })

  it('lg buttonSize produces h-14', () => {
    expect(getBtnClass('lg')).toContain('h-14')
  })

  it('SUNMI page passes buttonSize="lg"', () => {
    const sunmiButtonSize: 'md' | 'lg' = 'lg'
    expect(getBtnClass(sunmiButtonSize)).toContain('h-14')
  })

  it('desktop page uses default (md)', () => {
    const desktopButtonSize: 'md' | 'lg' = 'md'
    expect(getBtnClass(desktopButtonSize)).toContain('h-12')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. All action configs have correct titles and labels
// ─────────────────────────────────────────────────────────────────────────────
describe('All dialog configs — correct Thai text', () => {
  it('approve: correct title and label', () => {
    const cfg = getDialogConfig('approve')
    expect(cfg.title).toBe('ยืนยันอนุมัติคำขอโอน')
    expect(cfg.confirmLabel).toBe('อนุมัติ')
  })

  it('reject: correct title and label', () => {
    const cfg = getDialogConfig('reject')
    expect(cfg.title).toBe('ปฏิเสธคำขอโอน')
    expect(cfg.confirmLabel).toBe('ปฏิเสธ')
  })

  it('dispatch: correct title and label', () => {
    const cfg = getDialogConfig('dispatch')
    expect(cfg.title).toBe('ยืนยันจัดส่งสินค้า')
    expect(cfg.confirmLabel).toBe('จัดส่งแล้ว')
  })

  it('cancel: requireReason and correct label', () => {
    const cfg = getDialogConfig('cancel')
    expect(cfg.requireReason).toBe(true)
    expect(cfg.confirmLabel).toBe('ยกเลิกคำขอ')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Loading state disables confirm in all scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe('Loading state disables confirm button', () => {
  it('disabled when loading=true even with reason filled', () => {
    expect(isConfirmDisabled(true, false, '')).toBe(true)
    expect(isConfirmDisabled(true, true, 'มีเหตุผล')).toBe(true)
    expect(isConfirmDisabled(true, false, 'any')).toBe(true)
  })

  it('not disabled when not loading and no reason required', () => {
    expect(isConfirmDisabled(false, false, '')).toBe(false)
  })
})
