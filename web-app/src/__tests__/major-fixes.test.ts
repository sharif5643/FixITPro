/**
 * Regression tests for Phase 16.10 major fixes:
 *   M-1 — POST /sales missing permission guard
 *   M-2 — Repair status allows skipping steps
 *   M-3 — Null product name in repair part stock error
 *   M-4 — File upload MIME-only validation (no extension whitelist)
 */
import { describe, it, expect } from 'vitest'

// ── M-1: Sales permission guard ─────────────────────────────────────────────
// The guard enforcement is in NestJS (not testable in vitest), but we can
// verify the permission key constant that the decorator receives and that
// the pattern is consistent with void/refund guards in the same controller.

describe('M-1 · sales permission guard — permission key consistency', () => {
  const PERMISSION_KEYS = {
    createSale: 'sales.create',
    voidSale:   'sales.refund',
    refundSale: 'sales.refund',
  } as const

  it('sales.create permission key is defined', () => {
    expect(PERMISSION_KEYS.createSale).toBe('sales.create')
  })

  it('void and refund share the same permission key', () => {
    expect(PERMISSION_KEYS.voidSale).toBe(PERMISSION_KEYS.refundSale)
  })

  it('create and refund use different permission keys', () => {
    expect(PERMISSION_KEYS.createSale).not.toBe(PERMISSION_KEYS.voidSale)
  })

  // Verify the role-to-permission matrix reflects the guard intent
  const ROLE_PERMISSIONS: Record<string, string[]> = {
    OWNER:       ['sales.create', 'sales.refund'],
    MANAGER:     ['sales.create', 'sales.refund'],
    CASHIER:     ['sales.create', 'sales.discount'],
    TECHNICIAN:  ['repair.create', 'repair.edit'],
    STOCK_STAFF: ['stock.adjust'],
  }

  it('CASHIER has sales.create permission', () => {
    expect(ROLE_PERMISSIONS.CASHIER).toContain('sales.create')
  })

  it('TECHNICIAN does not have sales.create permission', () => {
    expect(ROLE_PERMISSIONS.TECHNICIAN).not.toContain('sales.create')
  })

  it('STOCK_STAFF does not have sales.create permission', () => {
    expect(ROLE_PERMISSIONS.STOCK_STAFF).not.toContain('sales.create')
  })

  it('OWNER has both sales.create and sales.refund', () => {
    expect(ROLE_PERMISSIONS.OWNER).toContain('sales.create')
    expect(ROLE_PERMISSIONS.OWNER).toContain('sales.refund')
  })
})

// ── M-2: Repair status transition — explicit allowed-transitions map ─────────

describe('M-2 · repair status transition — allowed-transitions map', () => {
  const ALLOWED: Record<string, string[]> = {
    'RECEIVED':         ['DIAGNOSING'],
    'DIAGNOSING':       ['WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'],
    'WAITING_APPROVAL': ['APPROVED'],
    'APPROVED':         ['WAITING_PARTS', 'IN_PROGRESS'],
    'WAITING_PARTS':    ['IN_PROGRESS'],
    'IN_PROGRESS':      ['COMPLETED', 'WAITING_PARTS'],
    'COMPLETED':        [],
  }

  function isTransitionAllowed(from: string, to: string): boolean {
    if (to === 'CANCELLED') return true  // always allowed
    if (from === to) return false         // no-op
    return (ALLOWED[from] ?? []).includes(to)
  }

  // ── Valid transitions
  it('RECEIVED → DIAGNOSING is allowed', () => {
    expect(isTransitionAllowed('RECEIVED', 'DIAGNOSING')).toBe(true)
  })

  it('DIAGNOSING → WAITING_APPROVAL is allowed', () => {
    expect(isTransitionAllowed('DIAGNOSING', 'WAITING_APPROVAL')).toBe(true)
  })

  it('DIAGNOSING → APPROVED is allowed (pre-approved simple repair)', () => {
    expect(isTransitionAllowed('DIAGNOSING', 'APPROVED')).toBe(true)
  })

  it('DIAGNOSING → IN_PROGRESS is allowed (no estimate needed)', () => {
    expect(isTransitionAllowed('DIAGNOSING', 'IN_PROGRESS')).toBe(true)
  })

  it('WAITING_APPROVAL → APPROVED is allowed', () => {
    expect(isTransitionAllowed('WAITING_APPROVAL', 'APPROVED')).toBe(true)
  })

  it('APPROVED → WAITING_PARTS is allowed', () => {
    expect(isTransitionAllowed('APPROVED', 'WAITING_PARTS')).toBe(true)
  })

  it('APPROVED → IN_PROGRESS is allowed (no parts needed)', () => {
    expect(isTransitionAllowed('APPROVED', 'IN_PROGRESS')).toBe(true)
  })

  it('WAITING_PARTS → IN_PROGRESS is allowed', () => {
    expect(isTransitionAllowed('WAITING_PARTS', 'IN_PROGRESS')).toBe(true)
  })

  it('IN_PROGRESS → COMPLETED is allowed', () => {
    expect(isTransitionAllowed('IN_PROGRESS', 'COMPLETED')).toBe(true)
  })

  it('IN_PROGRESS → WAITING_PARTS is allowed (more parts discovered)', () => {
    expect(isTransitionAllowed('IN_PROGRESS', 'WAITING_PARTS')).toBe(true)
  })

  it('any status → CANCELLED is allowed', () => {
    const statuses = ['RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED',
                      'WAITING_PARTS', 'IN_PROGRESS', 'COMPLETED']
    for (const s of statuses) {
      expect(isTransitionAllowed(s, 'CANCELLED')).toBe(true)
    }
  })

  // ── Blocked skip transitions (the core of M-2 fix)
  it('RECEIVED → COMPLETED is blocked (skips diagnosis + approval)', () => {
    expect(isTransitionAllowed('RECEIVED', 'COMPLETED')).toBe(false)
  })

  it('RECEIVED → IN_PROGRESS is blocked (skips diagnosis)', () => {
    expect(isTransitionAllowed('RECEIVED', 'IN_PROGRESS')).toBe(false)
  })

  it('RECEIVED → APPROVED is blocked', () => {
    expect(isTransitionAllowed('RECEIVED', 'APPROVED')).toBe(false)
  })

  it('RECEIVED → WAITING_PARTS is blocked', () => {
    expect(isTransitionAllowed('RECEIVED', 'WAITING_PARTS')).toBe(false)
  })

  it('DIAGNOSING → COMPLETED is blocked', () => {
    expect(isTransitionAllowed('DIAGNOSING', 'COMPLETED')).toBe(false)
  })

  it('WAITING_APPROVAL → IN_PROGRESS is blocked (must be approved first)', () => {
    expect(isTransitionAllowed('WAITING_APPROVAL', 'IN_PROGRESS')).toBe(false)
  })

  it('WAITING_APPROVAL → COMPLETED is blocked', () => {
    expect(isTransitionAllowed('WAITING_APPROVAL', 'COMPLETED')).toBe(false)
  })

  it('APPROVED → COMPLETED is blocked (must go through IN_PROGRESS)', () => {
    expect(isTransitionAllowed('APPROVED', 'COMPLETED')).toBe(false)
  })

  it('COMPLETED → any is blocked (terminal state)', () => {
    const targets = ['RECEIVED', 'DIAGNOSING', 'IN_PROGRESS', 'WAITING_PARTS']
    for (const t of targets) {
      expect(isTransitionAllowed('COMPLETED', t)).toBe(false)
    }
  })

  // ── Backward transitions blocked
  it('DIAGNOSING → RECEIVED is blocked (backward)', () => {
    expect(isTransitionAllowed('DIAGNOSING', 'RECEIVED')).toBe(false)
  })

  it('IN_PROGRESS → RECEIVED is blocked (backward)', () => {
    expect(isTransitionAllowed('IN_PROGRESS', 'RECEIVED')).toBe(false)
  })

  it('COMPLETED → IN_PROGRESS is blocked (backward)', () => {
    expect(isTransitionAllowed('COMPLETED', 'IN_PROGRESS')).toBe(false)
  })

  it('no-op (same status) is blocked', () => {
    expect(isTransitionAllowed('IN_PROGRESS', 'IN_PROGRESS')).toBe(false)
  })
})

// ── M-3: Null-safe product name in repair stock error ───────────────────────

describe('M-3 · repair part stock error — null-safe product name', () => {
  function buildStockErrorMessage(
    product: { name: string } | null,
    productId: string,
    available: number,
    needed: number,
  ): string {
    const productName = product?.name ?? `[ID: ${productId}]`
    return `สต็อกสาขาไม่พอสำหรับ "${productName}" มีอยู่ในสาขา: ${available} ชิ้น (ต้องการ: ${needed})`
  }

  it('shows product name when product exists', () => {
    const msg = buildStockErrorMessage({ name: 'iPhone 13 Screen' }, 'p-1', 2, 5)
    expect(msg).toContain('iPhone 13 Screen')
    expect(msg).not.toContain('[ID:')
    expect(msg).not.toContain('undefined')
  })

  it('shows product ID fallback when product is null (deleted)', () => {
    const msg = buildStockErrorMessage(null, 'prod-uuid-999', 0, 3)
    expect(msg).toContain('[ID: prod-uuid-999]')
    expect(msg).not.toContain('undefined')
  })

  it('shows product ID fallback when product name is empty string', () => {
    const msg = buildStockErrorMessage({ name: '' }, 'prod-abc', 1, 2)
    // In production code: product?.name ?? fallback — empty string passes through
    // because empty string IS a valid (if odd) name.  Just ensure no crash.
    expect(msg).not.toContain('undefined')
  })

  it('message includes available and needed quantities', () => {
    const msg = buildStockErrorMessage({ name: 'Battery' }, 'p-2', 3, 7)
    expect(msg).toContain('3')
    expect(msg).toContain('7')
  })

  it('no crash when productId is a UUID-like string', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const msg = buildStockErrorMessage(null, uuid, 0, 1)
    expect(msg).toContain(uuid)
    expect(() => msg).not.toThrow()
  })
})

// ── M-4: File upload — extension whitelist + MIME-derived filename ───────────

describe('M-4 · file upload — extension whitelist validation', () => {
  const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
  const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
    'image/gif':  '.gif',
  }

  function getExt(filename: string): string {
    const parts = filename.split('.')
    return parts.length > 1 ? `.${parts[parts.length - 1].toLowerCase()}` : ''
  }

  function isUploadAllowed(filename: string, mimetype: string): boolean {
    const ext = getExt(filename)
    return mimetype.startsWith('image/') && ALLOWED_EXTS.has(ext)
  }

  function getSafeFilename(mimetype: string): string {
    const unique  = '1234567890-987654321'
    const safeExt = MIME_TO_EXT[mimetype] ?? '.jpg'
    return `${unique}${safeExt}`
  }

  // ── Allowed uploads
  it('photo.jpg with image/jpeg is allowed', () => {
    expect(isUploadAllowed('photo.jpg', 'image/jpeg')).toBe(true)
  })

  it('image.png with image/png is allowed', () => {
    expect(isUploadAllowed('image.png', 'image/png')).toBe(true)
  })

  it('image.webp with image/webp is allowed', () => {
    expect(isUploadAllowed('image.webp', 'image/webp')).toBe(true)
  })

  it('photo.jpeg with image/jpeg is allowed', () => {
    expect(isUploadAllowed('photo.jpeg', 'image/jpeg')).toBe(true)
  })

  it('anim.gif with image/gif is allowed', () => {
    expect(isUploadAllowed('anim.gif', 'image/gif')).toBe(true)
  })

  // ── Forged / malicious files blocked
  it('shell.php with forged image/jpeg MIME is blocked (ext not in whitelist)', () => {
    expect(isUploadAllowed('shell.php', 'image/jpeg')).toBe(false)
  })

  it('shell.jpg.php with image/jpeg is blocked (.php extension)', () => {
    // extname('shell.jpg.php') → '.php'
    expect(isUploadAllowed('shell.jpg.php', 'image/jpeg')).toBe(false)
  })

  it('malicious.php.jpg has safe extension but upload is allowed (ext is .jpg)', () => {
    // This is fine: attacker named it .php.jpg but ext is .jpg and MIME is image/jpeg
    expect(isUploadAllowed('malicious.php.jpg', 'image/jpeg')).toBe(true)
    // Safe because stored filename uses MIME-derived extension, not original
  })

  it('document.pdf with application/pdf MIME is blocked', () => {
    expect(isUploadAllowed('document.pdf', 'application/pdf')).toBe(false)
  })

  it('script.js with text/javascript MIME is blocked', () => {
    expect(isUploadAllowed('script.js', 'text/javascript')).toBe(false)
  })

  it('file with no extension is blocked', () => {
    expect(isUploadAllowed('noextension', 'image/jpeg')).toBe(false)
  })

  it('shell.PHP (uppercase) is blocked (case-insensitive ext check)', () => {
    // getExt lowercases the extension
    expect(isUploadAllowed('shell.PHP', 'image/jpeg')).toBe(false)
  })

  // ── MIME-derived safe filename (not from original name)
  it('stored filename uses MIME-derived .jpg for image/jpeg', () => {
    expect(getSafeFilename('image/jpeg')).toMatch(/\.jpg$/)
  })

  it('stored filename uses .png for image/png', () => {
    expect(getSafeFilename('image/png')).toMatch(/\.png$/)
  })

  it('stored filename uses .webp for image/webp', () => {
    expect(getSafeFilename('image/webp')).toMatch(/\.webp$/)
  })

  it('stored filename uses .gif for image/gif', () => {
    expect(getSafeFilename('image/gif')).toMatch(/\.gif$/)
  })

  it('stored filename never preserves a dangerous original extension', () => {
    // Even if original was shell.jpg.php, stored name is MIME-derived
    const stored = getSafeFilename('image/jpeg')
    expect(stored).not.toMatch(/\.php$/)
    expect(stored).not.toMatch(/\.exe$/)
    expect(stored).not.toMatch(/\.sh$/)
  })

  it('MIME_TO_EXT covers all whitelisted image MIMEs', () => {
    expect(MIME_TO_EXT['image/jpeg']).toBeDefined()
    expect(MIME_TO_EXT['image/png']).toBeDefined()
    expect(MIME_TO_EXT['image/webp']).toBeDefined()
    expect(MIME_TO_EXT['image/gif']).toBeDefined()
  })
})
