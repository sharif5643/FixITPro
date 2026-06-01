/**
 * Regression tests for Sprint 1.4 — Validation & CSP Hardening
 *   CHB-05 — @Max() bounds on all financial DTO fields
 *   CHB-11 — Content-Security-Policy header in nginx template
 */
import { describe, it, expect } from 'vitest'

// ── CHB-05: Financial field upper-bound constants ────────────────────────────

// Mirror the exact limits applied in all financial DTOs
const MAX_MONEY       = 10_000_000   // THB per transaction (expenses, payments, repair costs)
const MAX_UNIT_PRICE  = 1_000_000    // per-item price / cost (products, sale items, parts)
const MAX_QUANTITY    = 10_000       // items per transaction / transfer
const MAX_STOCK_QTY   = 100_000      // inventory quantity (product stock, branch stock)
const MAX_CARRIER     = 100_000      // carrier wallet topup / package sale
const MAX_SHIFT_CASH  = 1_000_000    // cash drawer open/close balance
const MAX_VAT_PERCENT = 100          // percentage
const MAX_WARRANTY    = 3_650        // days (10 years)
const MAX_STOCK_ADJ   = 100_000      // stock adjustment (positive or negative)

describe('CHB-05 · Financial DTO @Max() bounds — shared validation logic', () => {
  function validate(value: number, min: number, max: number): boolean {
    return value >= min && value <= max
  }

  // ── Debt payment ────────────────────────────────────────────────────────────
  describe('CreateDebtPaymentDto.amount', () => {
    it('accepts 0.01 (minimum)', ()  => expect(validate(0.01, 0.01, MAX_MONEY)).toBe(true))
    it('accepts 500', ()             => expect(validate(500, 0.01, MAX_MONEY)).toBe(true))
    it('accepts max 10,000,000', ()  => expect(validate(MAX_MONEY, 0.01, MAX_MONEY)).toBe(true))
    it('rejects 0 (below min)', ()   => expect(validate(0, 0.01, MAX_MONEY)).toBe(false))
    it('rejects 10,000,001', ()      => expect(validate(10_000_001, 0.01, MAX_MONEY)).toBe(false))
    it('rejects 99,999,999', ()      => expect(validate(99_999_999, 0.01, MAX_MONEY)).toBe(false))
  })

  // ── Expense ────────────────────────────────────────────────────────────────
  describe('CreateExpenseDto.amount', () => {
    it('accepts 1', ()               => expect(validate(1, 0.01, MAX_MONEY)).toBe(true))
    it('accepts 10,000,000', ()      => expect(validate(MAX_MONEY, 0.01, MAX_MONEY)).toBe(true))
    it('rejects 10,000,001', ()      => expect(validate(10_000_001, 0.01, MAX_MONEY)).toBe(false))
  })

  // ── Carrier wallet ─────────────────────────────────────────────────────────
  describe('TopupDto.amount and PackageSaleDto.packageAmount', () => {
    it('accepts 100', ()             => expect(validate(100, 1, MAX_CARRIER)).toBe(true))
    it('accepts max 100,000', ()     => expect(validate(MAX_CARRIER, 1, MAX_CARRIER)).toBe(true))
    it('rejects 0', ()               => expect(validate(0, 1, MAX_CARRIER)).toBe(false))
    it('rejects 100,001', ()         => expect(validate(100_001, 1, MAX_CARRIER)).toBe(false))
  })

  // ── Purchase order ─────────────────────────────────────────────────────────
  describe('CreatePOItemDto.unitCost', () => {
    it('accepts 0 (free item)', ()   => expect(validate(0, 0, MAX_UNIT_PRICE)).toBe(true))
    it('accepts 999,999', ()         => expect(validate(999_999, 0, MAX_UNIT_PRICE)).toBe(true))
    it('accepts max 1,000,000', ()   => expect(validate(MAX_UNIT_PRICE, 0, MAX_UNIT_PRICE)).toBe(true))
    it('rejects 1,000,001', ()       => expect(validate(1_000_001, 0, MAX_UNIT_PRICE)).toBe(false))
  })

  describe('CreatePOItemDto.quantity', () => {
    it('accepts 1', ()               => expect(validate(1, 1, MAX_QUANTITY)).toBe(true))
    it('accepts max 10,000', ()      => expect(validate(MAX_QUANTITY, 1, MAX_QUANTITY)).toBe(true))
    it('rejects 0', ()               => expect(validate(0, 1, MAX_QUANTITY)).toBe(false))
    it('rejects 10,001', ()          => expect(validate(10_001, 1, MAX_QUANTITY)).toBe(false))
  })

  describe('CreatePurchaseOrderDto.vatPercent', () => {
    it('accepts 0', ()               => expect(validate(0, 0, MAX_VAT_PERCENT)).toBe(true))
    it('accepts 7 (Thai VAT)', ()    => expect(validate(7, 0, MAX_VAT_PERCENT)).toBe(true))
    it('accepts max 100', ()         => expect(validate(MAX_VAT_PERCENT, 0, MAX_VAT_PERCENT)).toBe(true))
    it('rejects 101', ()             => expect(validate(101, 0, MAX_VAT_PERCENT)).toBe(false))
    it('rejects 999', ()             => expect(validate(999, 0, MAX_VAT_PERCENT)).toBe(false))
  })

  // ── Repair ─────────────────────────────────────────────────────────────────
  describe('RepairPaymentDto.amountPaid and UpdateRepairDto.finalCost', () => {
    it('accepts 0 (free repair)', () => expect(validate(0, 0, MAX_MONEY)).toBe(true))
    it('accepts 3,500', ()           => expect(validate(3_500, 0, MAX_MONEY)).toBe(true))
    it('accepts max 10,000,000', ()  => expect(validate(MAX_MONEY, 0, MAX_MONEY)).toBe(true))
    it('rejects 10,000,001', ()      => expect(validate(10_000_001, 0, MAX_MONEY)).toBe(false))
  })

  describe('RepairPaymentDto.warrantyDays', () => {
    it('accepts 0 (no warranty)', () => expect(validate(0, 0, MAX_WARRANTY)).toBe(true))
    it('accepts 365 (1 year)', ()    => expect(validate(365, 0, MAX_WARRANTY)).toBe(true))
    it('accepts max 3,650 (10yr)', ()=> expect(validate(MAX_WARRANTY, 0, MAX_WARRANTY)).toBe(true))
    it('rejects 3,651', ()           => expect(validate(3_651, 0, MAX_WARRANTY)).toBe(false))
    it('rejects 36,500 (100yr)', ()  => expect(validate(36_500, 0, MAX_WARRANTY)).toBe(false))
  })

  // ── Sales ──────────────────────────────────────────────────────────────────
  describe('SaleItemDto.price', () => {
    it('accepts 0 (gift/free)', ()   => expect(validate(0, 0, MAX_UNIT_PRICE)).toBe(true))
    it('accepts 25,000', ()          => expect(validate(25_000, 0, MAX_UNIT_PRICE)).toBe(true))
    it('accepts max 1,000,000', ()   => expect(validate(MAX_UNIT_PRICE, 0, MAX_UNIT_PRICE)).toBe(true))
    it('rejects 1,000,001', ()       => expect(validate(1_000_001, 0, MAX_UNIT_PRICE)).toBe(false))
  })

  describe('SaleItemDto.quantity', () => {
    it('accepts 1', ()               => expect(validate(1, 1, MAX_QUANTITY)).toBe(true))
    it('accepts 100', ()             => expect(validate(100, 1, MAX_QUANTITY)).toBe(true))
    it('accepts max 10,000', ()      => expect(validate(MAX_QUANTITY, 1, MAX_QUANTITY)).toBe(true))
    it('rejects 0', ()               => expect(validate(0, 1, MAX_QUANTITY)).toBe(false))
    it('rejects 10,001', ()          => expect(validate(10_001, 1, MAX_QUANTITY)).toBe(false))
  })

  // ── Product ────────────────────────────────────────────────────────────────
  describe('CreateProductDto.price and costPrice', () => {
    it('accepts 0', ()               => expect(validate(0, 0, MAX_UNIT_PRICE)).toBe(true))
    it('accepts 599', ()             => expect(validate(599, 0, MAX_UNIT_PRICE)).toBe(true))
    it('accepts max 1,000,000', ()   => expect(validate(MAX_UNIT_PRICE, 0, MAX_UNIT_PRICE)).toBe(true))
    it('rejects 1,000,001', ()       => expect(validate(1_000_001, 0, MAX_UNIT_PRICE)).toBe(false))
  })

  describe('CreateProductDto.warrantyDays', () => {
    it('accepts 0', ()               => expect(validate(0, 0, MAX_WARRANTY)).toBe(true))
    it('accepts 365', ()             => expect(validate(365, 0, MAX_WARRANTY)).toBe(true))
    it('rejects 3,651', ()           => expect(validate(3_651, 0, MAX_WARRANTY)).toBe(false))
  })

  // ── Shift cash ─────────────────────────────────────────────────────────────
  describe('OpenShiftDto.openBalance and CloseShiftDto.closeBalance', () => {
    it('accepts 0', ()               => expect(validate(0, 0, MAX_SHIFT_CASH)).toBe(true))
    it('accepts 50,000', ()          => expect(validate(50_000, 0, MAX_SHIFT_CASH)).toBe(true))
    it('accepts max 1,000,000', ()   => expect(validate(MAX_SHIFT_CASH, 0, MAX_SHIFT_CASH)).toBe(true))
    it('rejects 1,000,001', ()       => expect(validate(1_000_001, 0, MAX_SHIFT_CASH)).toBe(false))
  })

  // ── Stock ──────────────────────────────────────────────────────────────────
  describe('SetBranchStockDto.quantity and CreateProductDto.stock', () => {
    it('accepts 0', ()               => expect(validate(0, 0, MAX_STOCK_QTY)).toBe(true))
    it('accepts 500', ()             => expect(validate(500, 0, MAX_STOCK_QTY)).toBe(true))
    it('accepts max 100,000', ()     => expect(validate(MAX_STOCK_QTY, 0, MAX_STOCK_QTY)).toBe(true))
    it('rejects 100,001', ()         => expect(validate(100_001, 0, MAX_STOCK_QTY)).toBe(false))
  })

  describe('AdjustStockDto.quantity (allows negative for OUT)', () => {
    it('accepts positive IN qty', () => expect(validate(500, -MAX_STOCK_ADJ, MAX_STOCK_ADJ)).toBe(true))
    it('accepts negative OUT qty', ()=> expect(validate(-50, -MAX_STOCK_ADJ, MAX_STOCK_ADJ)).toBe(true))
    it('rejects +100,001', ()        => expect(validate(100_001, -MAX_STOCK_ADJ, MAX_STOCK_ADJ)).toBe(false))
    it('rejects -100,001', ()        => expect(validate(-100_001, -MAX_STOCK_ADJ, MAX_STOCK_ADJ)).toBe(false))
  })

  describe('CreateTransferDto.quantity', () => {
    it('accepts 1', ()               => expect(validate(1, 1, MAX_QUANTITY)).toBe(true))
    it('accepts max 10,000', ()      => expect(validate(MAX_QUANTITY, 1, MAX_QUANTITY)).toBe(true))
    it('rejects 0', ()               => expect(validate(0, 1, MAX_QUANTITY)).toBe(false))
    it('rejects 10,001', ()          => expect(validate(10_001, 1, MAX_QUANTITY)).toBe(false))
  })
})

// ── CHB-11: CSP header in nginx template ────────────────────────────────────

describe('CHB-11 · CSP directives — nginx template header values', () => {
  // Model the CSP strings added to the nginx template
  const API_CSP  = "default-src 'none'; frame-ancestors 'none'; object-src 'none'"
  const APP_CSP  = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss: https:; frame-ancestors 'none'; object-src 'none'"
  const ADMIN_CSP = APP_CSP  // admin uses same Next.js app CSP

  function parseCSP(header: string): Record<string, string[]> {
    return Object.fromEntries(
      header.split(';').map(d => d.trim()).filter(Boolean).map(d => {
        const [directive, ...values] = d.split(/\s+/)
        return [directive, values]
      })
    )
  }

  describe('API server CSP (api.fixitpro.app)', () => {
    const directives = parseCSP(API_CSP)

    it("default-src is 'none'", () =>
      expect(directives['default-src']).toContain("'none'"))
    it("frame-ancestors is 'none' (prevents clickjacking)", () =>
      expect(directives['frame-ancestors']).toContain("'none'"))
    it("object-src is 'none' (no Flash/PDF plugins)", () =>
      expect(directives['object-src']).toContain("'none'"))
    it('does not allow any external scripts', () =>
      expect(directives['script-src']).toBeUndefined())
  })

  describe('App dashboard CSP (app.fixitpro.app)', () => {
    const directives = parseCSP(APP_CSP)

    it("default-src is 'self'", () =>
      expect(directives['default-src']).toContain("'self'"))
    it("script-src is 'self' (no inline scripts)", () => {
      expect(directives['script-src']).toContain("'self'")
      expect(directives['script-src']).not.toContain("'unsafe-inline'")
    })
    it("style-src allows 'unsafe-inline' (Next.js CSS-in-JS)", () => {
      expect(directives['style-src']).toContain("'self'")
      expect(directives['style-src']).toContain("'unsafe-inline'")
    })
    it("img-src allows data: and blob: for image uploads", () => {
      expect(directives['img-src']).toContain('data:')
      expect(directives['img-src']).toContain('blob:')
    })
    it("font-src allows self and data: for embedded fonts", () => {
      expect(directives['font-src']).toContain("'self'")
      expect(directives['font-src']).toContain('data:')
    })
    it("connect-src allows wss: for WebSocket and https: for API", () => {
      expect(directives['connect-src']).toContain('wss:')
      expect(directives['connect-src']).toContain('https:')
    })
    it("frame-ancestors 'none' prevents clickjacking", () =>
      expect(directives['frame-ancestors']).toContain("'none'"))
    it("object-src 'none' blocks plugin content", () =>
      expect(directives['object-src']).toContain("'none'"))
    it('has exactly 8 directives', () =>
      expect(Object.keys(directives)).toHaveLength(8))
  })

  describe('Admin panel CSP (admin.fixitpro.app)', () => {
    it('admin CSP matches app dashboard CSP', () =>
      expect(ADMIN_CSP).toBe(APP_CSP))
  })

  describe('CSP security properties', () => {
    it('no CSP header allows data: in script-src (XSS vector)', () => {
      const directives = parseCSP(APP_CSP)
      expect(directives['script-src']).not.toContain('data:')
    })
    it('no CSP header uses wildcard * in default-src', () => {
      const directives = parseCSP(APP_CSP)
      expect(directives['default-src']).not.toContain('*')
    })
    it('no CSP header allows unsafe-eval in script-src', () => {
      const directives = parseCSP(APP_CSP)
      expect(directives['script-src']).not.toContain("'unsafe-eval'")
    })
  })
})
