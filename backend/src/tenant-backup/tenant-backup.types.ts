// ── Tenant Backup / Restore — shared types ───────────────────────────────────
// Phase 4F.3-B

export const BACKUP_FORMAT_VERSION = 2;

export type BackupJobStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
export type RestoreJobStatus = 'RUNNING' | 'VALIDATING' | 'DRY_RUN' | 'RESTORING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
export type RestoreDestination = 'SAME_TENANT' | 'NEW_TENANT';

export interface BackupCounts {
  tenants: number;
  branches: number;
  users: number;
  categories: number;
  customers: number;
  customerNotes: number;
  loyaltyTransactions: number;
  suppliers: number;
  products: number;
  branchStocks: number;
  stockMovements: number;
  stockTransfers: number;
  sales: number;
  saleItems: number;
  salePayments: number;
  saleRefunds: number;
  saleRefundItems: number;
  repairs: number;
  repairParts: number;
  repairImages: number;
  repairPaymentReversals: number;
  repairAdditionalPayments: number;
  repairQcs: number;
  repairMessages: number;
  repairReviews: number;
  purchaseOrders: number;
  purchaseOrderItems: number;
  supplierPayments: number;
  serialNumbers: number;
  claims: number;
  claimHistories: number;
  warranties: number;
  expenseCategories: number;
  expenses: number;
  cashDrawers: number;
  cashDrawerSessions: number;
  cashDrawerParticipants: number;
  cashDrawerTransactions: number;
  dailyCloses: number;
  notifications: number;
  accountingAccounts: number;
  journalEntries: number;
  journalLines: number;
  tenantModules: number;
  partnerRelationships: number;
  partnerTransfers: number;
  partnerTransferEvents: number;
  partnerQuotations: number;
  partnerQuotationEvents: number;
  shifts: number;
  shopSettings: number;
}

export interface BackupManifest {
  formatVersion: number;           // BACKUP_FORMAT_VERSION
  application: 'FixITPro';
  backupType: 'SINGLE_TENANT' | 'MULTI_TENANT';
  tenantIds: string[];             // array of tenant IDs in this backup
  createdAt: string;               // ISO 8601
  schemaVersion: string;           // prisma migration count
  counts: Record<string, BackupCounts>;  // keyed by tenantId
  totalCounts: BackupCounts;
  checksums: Record<string, string>;     // filename → sha256
  // Security: NEVER include passwords, tokens, secrets
}

export interface BackupJobRecord {
  id: string;
  status: BackupJobStatus;
  tenantIds: string[];
  backupType: 'SINGLE_TENANT' | 'MULTI_TENANT';
  startedAt: string;
  completedAt?: string;
  createdById: string;
  createdByName: string;
  filePath?: string;         // server-side path to .tar.gz
  fileName?: string;         // e.g. fixitpro-backup-20260824-abc123.tar.gz
  sizeBytes?: number;
  error?: string;
  counts?: Record<string, BackupCounts>;
}

export interface RestoreValidationResult {
  readable: boolean;
  checksumValid: boolean;
  schemaCompatible: boolean;
  tenantDataValid: boolean;
  foreignKeyValid: boolean;
  accountingValid: boolean;
  partnerPolicyValid: boolean;
  errors: string[];
  warnings: string[];
  counts?: Record<string, BackupCounts>;
}

export interface RestoreJobRecord {
  id: string;
  status: RestoreJobStatus;
  backupJobId: string;
  destination: RestoreDestination;
  sourceTenantId: string;
  destinationTenantId: string;
  startedAt: string;
  completedAt?: string;
  createdById: string;
  createdByName: string;
  preRestoreBackupId?: string;   // safety snapshot before restore
  error?: string;
  validation?: RestoreValidationResult;
  restoredCounts?: BackupCounts;
}

// Fields EXCLUDED from backup for security
export const USER_EXCLUDED_FIELDS = [
  'password',
  'googleId',
  'lineUserId',
] as const;

export const SHOP_SETTINGS_EXCLUDED_FIELDS = [
  'lineChannelAccessToken',
] as const;

// Globally unique constraints that prevent restore to different tenant
export const GLOBAL_UNIQUE_CONSTRAINTS = [
  'Sale.receiptNumber',
  'Repair.ticketNumber',
  'SaleRefund.refundNumber',
  'StockTransfer.transferNumber',
  'PurchaseOrder.poNumber',
  'SerialNumber.serial',
  'Claim.claimNumber',
  'Warranty.warrantyNumber',
  'JournalEntry.entryNumber',
  'User.email',
  'User.username',
] as const;
