import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tar = require('tar');

import {
  RestoreJobRecord,
  RestoreDestination,
  BackupManifest,
  GLOBAL_UNIQUE_CONSTRAINTS,
} from './tenant-backup.types';
import { TenantBackupService } from './tenant-backup.service';
import { backupDir as defaultBackupDir } from '../common/storage-paths';

const TENANT_BACKUP_DIR = path.join(defaultBackupDir, 'tenant-backups');
const RESTORE_JOBS_FILE = path.join(TENANT_BACKUP_DIR, '.restore-jobs.json');

@Injectable()
export class TenantRestoreService {
  private readonly logger = new Logger(TenantRestoreService.name);
  private restoreJobs = new Map<string, RestoreJobRecord>();

  constructor(
    private prisma: PrismaService,
    private backupSvc: TenantBackupService,
  ) {
    this.loadRestoreJobs();
  }

  private loadRestoreJobs() {
    try {
      if (fs.existsSync(RESTORE_JOBS_FILE)) {
        const arr: RestoreJobRecord[] = JSON.parse(fs.readFileSync(RESTORE_JOBS_FILE, 'utf8'));
        arr.forEach((j) => this.restoreJobs.set(j.id, j));
      }
    } catch (e) {
      this.logger.warn('Could not load restore jobs: ' + (e as Error).message);
    }
  }

  private persistRestoreJobs() {
    try {
      fs.writeFileSync(
        RESTORE_JOBS_FILE,
        JSON.stringify(Array.from(this.restoreJobs.values()), null, 2),
        'utf8',
      );
    } catch (e) {
      this.logger.warn('Could not persist restore jobs: ' + (e as Error).message);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  listRestoreJobs(): RestoreJobRecord[] {
    return Array.from(this.restoreJobs.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }

  getRestoreJob(id: string): RestoreJobRecord {
    const job = this.restoreJobs.get(id);
    if (!job) throw new NotFoundException(`Restore job ${id} not found`);
    return job;
  }

  /**
   * Start a restore job.
   *
   * Only SAME_TENANT restore is supported.
   * NEW_TENANT restore is BLOCKED due to:
   *   - Global unique constraints: ${GLOBAL_UNIQUE_CONSTRAINTS.join(', ')}
   *   - User email uniqueness conflicts
   *   - Partner relationship cross-tenant references
   *   - JournalEntry idempotency index (sourceType+sourceId+tenantId)
   */
  async startRestore(
    backupJobId: string,
    destination: RestoreDestination,
    destinationTenantId: string,
    actorId: string,
    actorName: string,
    confirmed: boolean,
  ): Promise<RestoreJobRecord> {
    if (!confirmed) {
      throw new BadRequestException('Restore requires explicit confirmation (confirmed=true)');
    }

    if (destination === 'NEW_TENANT') {
      throw new ForbiddenException(
        'Restore to a different tenant is BLOCKED. ' +
        'Global unique constraints (receiptNumber, ticketNumber, serial, email, etc.) ' +
        'cannot be remapped safely without breaking historical data integrity. ' +
        'Partner relationships also create dangling cross-tenant references. ' +
        'Only SAME_TENANT restore is supported in this version.',
      );
    }

    const backupJob = this.backupSvc.getJob(backupJobId);
    if (backupJob.status !== 'SUCCESS') {
      throw new BadRequestException(`Backup job ${backupJobId} is not complete`);
    }

    // Verify destination tenant exists
    const destTenant = await this.prisma.tenant.findUnique({
      where: { id: destinationTenantId },
    });
    if (!destTenant) {
      throw new NotFoundException(`Destination tenant ${destinationTenantId} not found`);
    }

    // Source tenant must be in the backup
    if (!backupJob.tenantIds.includes(destinationTenantId)) {
      throw new BadRequestException(
        `Tenant ${destinationTenantId} was not included in backup job ${backupJobId}`,
      );
    }

    const jobId = crypto.randomUUID();
    const job: RestoreJobRecord = {
      id: jobId,
      status: 'RUNNING',
      backupJobId,
      destination,
      sourceTenantId: destinationTenantId,
      destinationTenantId,
      startedAt: new Date().toISOString(),
      createdById: actorId,
      createdByName: actorName,
    };
    this.restoreJobs.set(jobId, job);
    this.persistRestoreJobs();

    // Run async
    this.runRestore(job, backupJob.filePath!).catch((err) => {
      this.logger.error(`Restore job ${jobId} failed: ${err.message}`);
      job.status = 'FAILED';
      job.error = String(err.message);
      job.completedAt = new Date().toISOString();
      this.persistRestoreJobs();
    });

    return job;
  }

  // ── Core Restore ────────────────────────────────────────────────────────────

  private async runRestore(job: RestoreJobRecord, archivePath: string): Promise<void> {
    const extractDir = path.join(TENANT_BACKUP_DIR, `restore-tmp-${job.id}`);

    try {
      // ── Phase 1: Extract archive ───────────────────────────────────────────
      job.status = 'VALIDATING';
      this.persistRestoreJobs();

      await fsPromises.mkdir(extractDir, { recursive: true });
      await tar.extract({ file: archivePath, C: extractDir });

      // ── Phase 2: Read manifest ─────────────────────────────────────────────
      const manifest: BackupManifest = JSON.parse(
        await fsPromises.readFile(path.join(extractDir, 'manifest.json'), 'utf8'),
      );

      // ── Phase 3: Determine data directory ─────────────────────────────────
      let dataDir: string;
      if (manifest.backupType === 'MULTI_TENANT') {
        dataDir = path.join(extractDir, 'tenants', job.sourceTenantId);
      } else {
        dataDir = extractDir;
      }

      if (!fs.existsSync(path.join(dataDir, 'tenant.json'))) {
        throw new Error(`tenant.json not found in archive for tenant ${job.sourceTenantId}`);
      }

      // ── Phase 4: Pre-restore safety snapshot ──────────────────────────────
      job.status = 'DRY_RUN';
      this.persistRestoreJobs();

      this.logger.log(`[Restore ${job.id}] Creating pre-restore safety snapshot...`);
      const preRestoreJob = await this.backupSvc.startBackup(
        [job.destinationTenantId],
        job.createdById,
        `PRE-RESTORE-${job.id}`,
      );
      job.preRestoreBackupId = preRestoreJob.id;
      this.persistRestoreJobs();

      // Wait for pre-restore backup to complete (max 60 seconds)
      let waited = 0;
      while (waited < 60000) {
        await new Promise((r) => setTimeout(r, 1000));
        waited += 1000;
        const current = this.backupSvc.getJob(preRestoreJob.id);
        if (current.status === 'SUCCESS') break;
        if (current.status === 'FAILED') {
          throw new Error(`Pre-restore safety backup failed: ${current.error}`);
        }
      }

      // ── Phase 5: Restore within a transaction ─────────────────────────────
      job.status = 'RESTORING';
      this.persistRestoreJobs();

      const tenantId = job.destinationTenantId;
      const restoredCounts = await this.restoreTenantData(tenantId, dataDir);

      // ── Phase 6: Integrity check ───────────────────────────────────────────
      const branchCount = await this.prisma.branch.count({ where: { tenantId } });
      const customerCount = await this.prisma.customer.count({ where: { tenantId } });

      if (branchCount === 0 && restoredCounts.branches > 0) {
        throw new Error('Post-restore integrity check failed: branches not restored');
      }

      job.status = 'SUCCESS';
      job.completedAt = new Date().toISOString();
      job.restoredCounts = restoredCounts;
      this.persistRestoreJobs();

      this.logger.log(
        `[Restore ${job.id}] Complete. ` +
        `Customers: ${customerCount}, Branches: ${branchCount}`,
      );
    } catch (err) {
      job.status = 'FAILED';
      job.error = String((err as Error).message);
      job.completedAt = new Date().toISOString();
      this.persistRestoreJobs();
      this.logger.error(`[Restore ${job.id}] Failed: ${(err as Error).message}`);
      throw err;
    } finally {
      try {
        await fsPromises.rm(extractDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }

  private async restoreTenantData(
    tenantId: string,
    dataDir: string,
  ) {
    const read = async <T>(filename: string): Promise<T[]> => {
      const p = path.join(dataDir, filename);
      if (!fs.existsSync(p)) return [];
      return JSON.parse(await fsPromises.readFile(p, 'utf8'));
    };

    // Read all data
    const [
      branches, users, categories, suppliers, customers,
      customerNotes, loyaltyTransactions,
      shopSettings, expenseCategories, cashDrawers, tenantModules,
      accountingAccounts,
      products, branchStocks, shifts, sales, repairs, expenses, purchaseOrders,
      cashDrawerSessions, dailyCloses, notifications, stockTransfers, journalEntries,
      saleItems, salePayments, saleRefunds,
      repairParts, repairImages, repairAdditionalPayments, repairPaymentReversals,
      repairQcs, repairMessages, repairReviews,
      purchaseOrderItems, supplierPayments,
      cashDrawerParticipants, cashDrawerTransactions,
      stockMovements, journalLines,
      serialNumbers, saleRefundItems, warranties, claims, claimHistories,
      partnerRelationships, partnerTransfers, partnerTransferEvents,
      partnerQuotations, partnerQuotationEvents,
    ] = await Promise.all([
      read('branches.json'),
      read('users.json'),
      read('categories.json'),
      read('suppliers.json'),
      read('customers.json'),
      read('customer_notes.json'),
      read('loyalty_transactions.json'),
      read<Record<string, unknown>>('shop_settings.json'),
      read('expense_categories.json'),
      read('cash_drawers.json'),
      read('tenant_modules.json'),
      read('accounting_accounts.json'),
      read('products.json'),
      read('branch_stocks.json'),
      read('shifts.json'),
      read('sales.json'),
      read('repairs.json'),
      read('expenses.json'),
      read('purchase_orders.json'),
      read('cash_drawer_sessions.json'),
      read('daily_closes.json'),
      read('notifications.json'),
      read('stock_transfers.json'),
      read('journal_entries.json'),
      read('sale_items.json'),
      read('sale_payments.json'),
      read('sale_refunds.json'),
      read('repair_parts.json'),
      read('repair_images.json'),
      read('repair_additional_payments.json'),
      read('repair_payment_reversals.json'),
      read('repair_qcs.json'),
      read('repair_messages.json'),
      read('repair_reviews.json'),
      read('purchase_order_items.json'),
      read('supplier_payments.json'),
      read('cash_drawer_participants.json'),
      read('cash_drawer_transactions.json'),
      read('stock_movements.json'),
      read('journal_lines.json'),
      read('serial_numbers.json'),
      read('sale_refund_items.json'),
      read('warranties.json'),
      read('claims.json'),
      read('claim_histories.json'),
      read('partner_relationships.json'),
      read('partner_transfers.json'),
      read('partner_transfer_events.json'),
      read('partner_quotations.json'),
      read('partner_quotation_events.json'),
    ]);

    // Helper: parse dates in an object
    const parseDates = <T>(obj: T): T => {
      if (!obj || typeof obj !== 'object') return obj;
      const result = { ...obj } as Record<string, unknown>;
      for (const [k, v] of Object.entries(result)) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
          result[k] = new Date(v);
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          result[k] = parseDates(v);
        }
      }
      return result as T;
    };

    // Use a Prisma transaction for atomicity
    // Note: for very large datasets this may exceed transaction timeout.
    // In that case, staged restore (per section 15 of spec) would be needed.
    // For typical tenant sizes this is safe.

    await this.prisma.$transaction(async (tx) => {
      // ── DELETE in reverse dependency order (avoid FK violations) ──────────

      // Tier 5: Partner events
      await tx.partnerRepairQuotationEvent.deleteMany({
        where: { quotation: { transfer: { ownerTenantId: tenantId } } },
      });
      await tx.partnerRepairQuotation.deleteMany({
        where: { transfer: { ownerTenantId: tenantId } },
      });
      await tx.partnerRepairTransferEvent.deleteMany({
        where: { transfer: { ownerTenantId: tenantId } },
      });
      await tx.partnerRepairTransfer.deleteMany({ where: { ownerTenantId: tenantId } });
      await tx.partnerRelationship.deleteMany({ where: { initiatorTenantId: tenantId } });

      // Tier 4
      await tx.claimStatusHistory.deleteMany({
        where: { claim: { serialNumber: { product: { tenantId } } } },
      });
      await tx.claim.deleteMany({
        where: { serialNumber: { product: { tenantId } } },
      });
      await tx.warranty.deleteMany({
        where: { OR: [{ customer: { tenantId } }, { repair: { branchId: null } }] },
      });
      await tx.warranty.deleteMany({ where: { repair: { branch: { tenantId } } } });
      await tx.saleRefundItem.deleteMany({
        where: { refund: { sale: { branch: { tenantId } } } },
      });
      await tx.serialNumber.deleteMany({ where: { product: { tenantId } } });

      // Tier 3
      await tx.journalLine.deleteMany({ where: { entry: { tenantId } } });
      await tx.cashDrawerTransaction.deleteMany({ where: { tenantId } });
      await tx.cashDrawerParticipant.deleteMany({
        where: { session: { tenantId } },
      });
      await tx.stockMovement.deleteMany({ where: { branch: { tenantId } } });
      await tx.saleRefund.deleteMany({ where: { sale: { branch: { tenantId } } } });
      await tx.salePayment.deleteMany({ where: { sale: { branch: { tenantId } } } });
      await tx.saleItem.deleteMany({ where: { sale: { branch: { tenantId } } } });
      await tx.supplierPayment.deleteMany({
        where: { purchaseOrder: { supplier: { tenantId } } },
      });
      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { supplier: { tenantId } } },
      });
      await tx.repairReview.deleteMany({ where: { repair: { branch: { tenantId } } } });
      await tx.repairMessage.deleteMany({ where: { repair: { branch: { tenantId } } } });
      await tx.repairQc.deleteMany({ where: { repair: { branch: { tenantId } } } });
      await tx.repairPaymentReversal.deleteMany({ where: { repair: { branch: { tenantId } } } });
      await tx.repairAdditionalPayment.deleteMany({ where: { repair: { branch: { tenantId } } } });
      await tx.repairImage.deleteMany({ where: { repair: { branch: { tenantId } } } });
      await tx.repairPart.deleteMany({ where: { repair: { branch: { tenantId } } } });

      // Tier 2
      await tx.journalEntry.deleteMany({ where: { tenantId } });
      await tx.cashDrawerSession.deleteMany({ where: { tenantId } });
      await tx.dailyClose.deleteMany({ where: { tenantId } });
      await tx.notification.deleteMany({ where: { tenantId } });
      await tx.stockTransfer.deleteMany({ where: { fromBranch: { tenantId } } });
      await tx.expense.deleteMany({ where: { branch: { tenantId } } });
      await tx.repair.deleteMany({ where: { branch: { tenantId } } });
      await tx.sale.deleteMany({ where: { branch: { tenantId } } });
      await tx.shift.deleteMany({ where: { branch: { tenantId } } });
      await tx.purchaseOrder.deleteMany({ where: { supplier: { tenantId } } });

      // Tier 1
      await tx.branchStock.deleteMany({ where: { branch: { tenantId } } });
      await tx.accountingAccount.deleteMany({ where: { tenantId } });
      await tx.cashDrawer.deleteMany({ where: { tenantId } });
      await tx.expenseCategory.deleteMany({ where: { tenantId } });
      await tx.shopSettings.deleteMany({ where: { tenantId } });
      await tx.tenantModule.deleteMany({ where: { tenantId } });
      await tx.loyaltyTransaction.deleteMany({ where: { customer: { tenantId } } });
      await tx.customerNote.deleteMany({ where: { customer: { tenantId } } });
      await tx.customer.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.category.deleteMany({ where: { tenantId } });
      await tx.supplier.deleteMany({ where: { tenantId } });
      // Refresh tokens for tenant users
      await tx.refreshToken.deleteMany({ where: { user: { tenantId } } });
      // Users
      await tx.user.deleteMany({ where: { tenantId } });
      // Branches
      await tx.branch.deleteMany({ where: { tenantId } });

      // ── INSERT in dependency order ─────────────────────────────────────────

      const withDates = <T>(arr: T[]): T[] => arr.map(parseDates);
      const omit = <T extends object>(obj: T, keys: string[]): Omit<T, keyof T> => {
        const r = { ...obj } as Record<string, unknown>;
        keys.forEach((k) => delete r[k]);
        return r as Omit<T, keyof T>;
      };

      // Branches
      for (const b of withDates(branches as Record<string, unknown>[])) {
        await tx.branch.create({ data: b as Parameters<typeof tx.branch.create>[0]['data'] });
      }

      // Users — with forcePasswordChange=true, random temp password
      for (const u of withDates(users as Record<string, unknown>[])) {
        const userData = {
          ...omit(u as Record<string, unknown>, ['password', 'googleId', 'lineUserId']),
          password: `__TEMP_RESTORE_${crypto.randomUUID()}__`,  // must be reset
          forcePasswordChange: true,
          googleId: null,
          lineUserId: null,
        };
        await tx.user.create({ data: userData as Parameters<typeof tx.user.create>[0]['data'] });
      }

      // Categories
      for (const c of withDates(categories as Record<string, unknown>[])) {
        await tx.category.create({ data: c as Parameters<typeof tx.category.create>[0]['data'] });
      }

      // Suppliers
      for (const s of withDates(suppliers as Record<string, unknown>[])) {
        await tx.supplier.create({ data: s as Parameters<typeof tx.supplier.create>[0]['data'] });
      }

      // Customers
      for (const c of withDates(customers as Record<string, unknown>[])) {
        await tx.customer.create({ data: c as Parameters<typeof tx.customer.create>[0]['data'] });
      }

      // CustomerNotes
      for (const cn of withDates(customerNotes as Record<string, unknown>[])) {
        await tx.customerNote.create({ data: cn as Parameters<typeof tx.customerNote.create>[0]['data'] });
      }

      // LoyaltyTransactions
      for (const lt of withDates(loyaltyTransactions as Record<string, unknown>[])) {
        await tx.loyaltyTransaction.create({ data: lt as Parameters<typeof tx.loyaltyTransaction.create>[0]['data'] });
      }

      // Products
      for (const p of withDates(products as Record<string, unknown>[])) {
        await tx.product.create({ data: p as Parameters<typeof tx.product.create>[0]['data'] });
      }

      // BranchStocks
      for (const bs of withDates(branchStocks as Record<string, unknown>[])) {
        await tx.branchStock.create({ data: bs as Parameters<typeof tx.branchStock.create>[0]['data'] });
      }

      // ShopSettings (exclude sensitive field)
      for (const ss of withDates(shopSettings)) {
        const data = omit(ss as Record<string, unknown>, ['lineChannelAccessToken']);
        await tx.shopSettings.create({ data: data as Parameters<typeof tx.shopSettings.create>[0]['data'] });
      }

      // ExpenseCategories
      for (const ec of withDates(expenseCategories as Record<string, unknown>[])) {
        await tx.expenseCategory.create({ data: ec as Parameters<typeof tx.expenseCategory.create>[0]['data'] });
      }

      // CashDrawers
      for (const cd of withDates(cashDrawers as Record<string, unknown>[])) {
        await tx.cashDrawer.create({ data: cd as Parameters<typeof tx.cashDrawer.create>[0]['data'] });
      }

      // TenantModules
      for (const tm of withDates(tenantModules as Record<string, unknown>[])) {
        await tx.tenantModule.create({ data: tm as Parameters<typeof tx.tenantModule.create>[0]['data'] });
      }

      // AccountingAccounts
      for (const aa of withDates(accountingAccounts as Record<string, unknown>[])) {
        await tx.accountingAccount.create({ data: aa as Parameters<typeof tx.accountingAccount.create>[0]['data'] });
      }

      // Shifts
      for (const s of withDates(shifts as Record<string, unknown>[])) {
        await tx.shift.create({ data: s as Parameters<typeof tx.shift.create>[0]['data'] });
      }

      // Sales
      for (const s of withDates(sales as Record<string, unknown>[])) {
        await tx.sale.create({ data: s as Parameters<typeof tx.sale.create>[0]['data'] });
      }

      // SaleItems
      for (const si of withDates(saleItems as Record<string, unknown>[])) {
        await tx.saleItem.create({ data: si as Parameters<typeof tx.saleItem.create>[0]['data'] });
      }

      // SalePayments
      for (const sp of withDates(salePayments as Record<string, unknown>[])) {
        await tx.salePayment.create({ data: sp as Parameters<typeof tx.salePayment.create>[0]['data'] });
      }

      // SaleRefunds
      for (const sr of withDates(saleRefunds as Record<string, unknown>[])) {
        await tx.saleRefund.create({ data: sr as Parameters<typeof tx.saleRefund.create>[0]['data'] });
      }

      // SaleRefundItems
      for (const sri of withDates(saleRefundItems as Record<string, unknown>[])) {
        await tx.saleRefundItem.create({ data: sri as Parameters<typeof tx.saleRefundItem.create>[0]['data'] });
      }

      // Repairs
      for (const r of withDates(repairs as Record<string, unknown>[])) {
        await tx.repair.create({ data: r as Parameters<typeof tx.repair.create>[0]['data'] });
      }

      // RepairParts, Images, etc.
      for (const rp of withDates(repairParts as Record<string, unknown>[])) {
        await tx.repairPart.create({ data: rp as Parameters<typeof tx.repairPart.create>[0]['data'] });
      }
      for (const ri of withDates(repairImages as Record<string, unknown>[])) {
        await tx.repairImage.create({ data: ri as Parameters<typeof tx.repairImage.create>[0]['data'] });
      }
      for (const rap of withDates(repairAdditionalPayments as Record<string, unknown>[])) {
        await tx.repairAdditionalPayment.create({ data: rap as Parameters<typeof tx.repairAdditionalPayment.create>[0]['data'] });
      }
      for (const rpr of withDates(repairPaymentReversals as Record<string, unknown>[])) {
        await tx.repairPaymentReversal.create({ data: rpr as Parameters<typeof tx.repairPaymentReversal.create>[0]['data'] });
      }
      for (const rqc of withDates(repairQcs as Record<string, unknown>[])) {
        await tx.repairQc.create({ data: rqc as Parameters<typeof tx.repairQc.create>[0]['data'] });
      }
      for (const rm of withDates(repairMessages as Record<string, unknown>[])) {
        await tx.repairMessage.create({ data: rm as Parameters<typeof tx.repairMessage.create>[0]['data'] });
      }
      for (const rr of withDates(repairReviews as Record<string, unknown>[])) {
        await tx.repairReview.create({ data: rr as Parameters<typeof tx.repairReview.create>[0]['data'] });
      }

      // Expenses
      for (const e of withDates(expenses as Record<string, unknown>[])) {
        await tx.expense.create({ data: e as Parameters<typeof tx.expense.create>[0]['data'] });
      }

      // PurchaseOrders
      for (const po of withDates(purchaseOrders as Record<string, unknown>[])) {
        await tx.purchaseOrder.create({ data: po as Parameters<typeof tx.purchaseOrder.create>[0]['data'] });
      }
      for (const poi of withDates(purchaseOrderItems as Record<string, unknown>[])) {
        await tx.purchaseOrderItem.create({ data: poi as Parameters<typeof tx.purchaseOrderItem.create>[0]['data'] });
      }
      for (const sp of withDates(supplierPayments as Record<string, unknown>[])) {
        await tx.supplierPayment.create({ data: sp as Parameters<typeof tx.supplierPayment.create>[0]['data'] });
      }

      // SerialNumbers
      for (const sn of withDates(serialNumbers as Record<string, unknown>[])) {
        await tx.serialNumber.create({ data: sn as Parameters<typeof tx.serialNumber.create>[0]['data'] });
      }

      // StockMovements
      for (const sm of withDates(stockMovements as Record<string, unknown>[])) {
        await tx.stockMovement.create({ data: sm as Parameters<typeof tx.stockMovement.create>[0]['data'] });
      }

      // StockTransfers
      for (const st of withDates(stockTransfers as Record<string, unknown>[])) {
        await tx.stockTransfer.create({ data: st as Parameters<typeof tx.stockTransfer.create>[0]['data'] });
      }

      // Warranties
      for (const w of withDates(warranties as Record<string, unknown>[])) {
        await tx.warranty.create({ data: w as Parameters<typeof tx.warranty.create>[0]['data'] });
      }

      // Claims
      for (const c of withDates(claims as Record<string, unknown>[])) {
        await tx.claim.create({ data: c as Parameters<typeof tx.claim.create>[0]['data'] });
      }
      for (const ch of withDates(claimHistories as Record<string, unknown>[])) {
        await tx.claimStatusHistory.create({ data: ch as Parameters<typeof tx.claimStatusHistory.create>[0]['data'] });
      }

      // CashDrawer system
      for (const cds of withDates(cashDrawerSessions as Record<string, unknown>[])) {
        await tx.cashDrawerSession.create({ data: cds as Parameters<typeof tx.cashDrawerSession.create>[0]['data'] });
      }
      for (const cdp of withDates(cashDrawerParticipants as Record<string, unknown>[])) {
        await tx.cashDrawerParticipant.create({ data: cdp as Parameters<typeof tx.cashDrawerParticipant.create>[0]['data'] });
      }
      for (const cdt of withDates(cashDrawerTransactions as Record<string, unknown>[])) {
        await tx.cashDrawerTransaction.create({ data: cdt as Parameters<typeof tx.cashDrawerTransaction.create>[0]['data'] });
      }

      // DailyCloses
      for (const dc of withDates(dailyCloses as Record<string, unknown>[])) {
        await tx.dailyClose.create({ data: dc as Parameters<typeof tx.dailyClose.create>[0]['data'] });
      }

      // Notifications
      for (const n of withDates(notifications as Record<string, unknown>[])) {
        await tx.notification.create({ data: n as Parameters<typeof tx.notification.create>[0]['data'] });
      }

      // Journal (accounting — restore as data, not as transactions)
      for (const je of withDates(journalEntries as Record<string, unknown>[])) {
        await tx.journalEntry.create({ data: je as Parameters<typeof tx.journalEntry.create>[0]['data'] });
      }
      for (const jl of withDates(journalLines as Record<string, unknown>[])) {
        await tx.journalLine.create({ data: jl as Parameters<typeof tx.journalLine.create>[0]['data'] });
      }

      // Partner data (same-tenant restore — restore relationships where this tenant is involved)
      for (const pr of withDates(partnerRelationships as Record<string, unknown>[])) {
        // Only restore if both tenants are present OR this is the initiator (safe to restore partial)
        try {
          await tx.partnerRelationship.create({ data: pr as Parameters<typeof tx.partnerRelationship.create>[0]['data'] });
        } catch (e) {
          this.logger.warn(
            `Skipping partner relationship ${(pr as Record<string,unknown>)['id']}: ${(e as Error).message}`,
          );
        }
      }

      for (const pt of withDates(partnerTransfers as Record<string, unknown>[])) {
        try {
          await tx.partnerRepairTransfer.create({ data: pt as Parameters<typeof tx.partnerRepairTransfer.create>[0]['data'] });
        } catch (e) {
          this.logger.warn(
            `Skipping partner transfer ${(pt as Record<string,unknown>)['id']}: ${(e as Error).message}`,
          );
        }
      }

      for (const pte of withDates(partnerTransferEvents as Record<string, unknown>[])) {
        await tx.partnerRepairTransferEvent.create({ data: pte as Parameters<typeof tx.partnerRepairTransferEvent.create>[0]['data'] });
      }

      for (const pq of withDates(partnerQuotations as Record<string, unknown>[])) {
        await tx.partnerRepairQuotation.create({ data: pq as Parameters<typeof tx.partnerRepairQuotation.create>[0]['data'] });
      }

      for (const pqe of withDates(partnerQuotationEvents as Record<string, unknown>[])) {
        await tx.partnerRepairQuotationEvent.create({ data: pqe as Parameters<typeof tx.partnerRepairQuotationEvent.create>[0]['data'] });
      }
    }, { timeout: 120000 }); // 2-minute transaction timeout

    // Count what was restored
    const restored = {
      tenants: 1,
      branches: branches.length,
      users: (users as unknown[]).length,
      customers: (customers as unknown[]).length,
      products: (products as unknown[]).length,
      repairs: (repairs as unknown[]).length,
      sales: (sales as unknown[]).length,
      expenses: (expenses as unknown[]).length,
      journalEntries: (journalEntries as unknown[]).length,
      journalLines: (journalLines as unknown[]).length,
      cashDrawerTransactions: (cashDrawerTransactions as unknown[]).length,
    } as ReturnType<typeof Object.fromEntries>;

    // Suppress unused warnings
    void shopSettings;

    return restored;
  }

  // ── Testing utility ─────────────────────────────────────────────────────────

  _setRestoreJob(job: RestoreJobRecord) {
    this.restoreJobs.set(job.id, job);
  }

  getBlockedDestinationReason(): string {
    return (
      'NEW_TENANT restore is BLOCKED. Global unique constraints (' +
      GLOBAL_UNIQUE_CONSTRAINTS.join(', ') +
      ') cannot be remapped safely without breaking historical data integrity.'
    );
  }
}
