/**
 * Tenant Backup & Restore API client
 * Calls /super-admin/backups/* endpoints on the backend.
 * Uses the shared api axios instance so 401/refresh is handled automatically.
 */

import api from '@/lib/api'

const BASE = '/super-admin/backups'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BackupJobStatus  = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'EXPIRED'
export type RestoreJobStatus = 'RUNNING' | 'VALIDATING' | 'DRY_RUN' | 'RESTORING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK'
export type RestoreDestination = 'SAME_TENANT' | 'NEW_TENANT'

export interface TenantInfo {
  id: string
  shopName: string
  ownerName: string
  status: string
  plan: string
  lastBackup: BackupJob | null
}

export interface BackupJob {
  id: string
  status: BackupJobStatus
  tenantIds: string[]
  backupType: 'SINGLE_TENANT' | 'MULTI_TENANT'
  startedAt: string
  completedAt?: string
  fileName?: string
  sizeBytes?: number
  error?: string
  createdById: string
  createdByName: string
}

export interface RestoreJob {
  id: string
  status: RestoreJobStatus
  backupJobId: string
  destination: RestoreDestination
  sourceTenantId: string
  destinationTenantId: string
  startedAt: string
  completedAt?: string
  preRestoreBackupId?: string
  error?: string
  createdById: string
  createdByName: string
}

export interface ValidationResult {
  readable: boolean
  checksumValid: boolean
  schemaCompatible: boolean
  tenantDataValid: boolean
  foreignKeyValid: boolean
  accountingValid: boolean
  partnerPolicyValid: boolean
  errors: string[]
  warnings: string[]
  counts?: Record<string, unknown>
}

// ── Tenant listing ────────────────────────────────────────────────────────────

export function listTenants(): Promise<TenantInfo[]> {
  return api.get<TenantInfo[]>(`${BASE}/tenants`).then(r => r.data)
}

// ── Backup jobs ───────────────────────────────────────────────────────────────

export function listBackupJobs(): Promise<BackupJob[]> {
  return api.get<BackupJob[]>(BASE).then(r => r.data)
}

export function getBackupJob(id: string): Promise<BackupJob> {
  return api.get<BackupJob>(`${BASE}/${id}`).then(r => r.data)
}

export function startBackup(tenantIds: string[]): Promise<BackupJob> {
  return api.post<BackupJob>(BASE, { tenantIds }).then(r => r.data)
}

export function validateBackup(id: string): Promise<ValidationResult> {
  return api.post<ValidationResult>(`${BASE}/${id}/validate`).then(r => r.data)
}

export function downloadUrl(id: string): string {
  // Returns a full absolute path for use as <a href> — not routed through axios.
  return `/api/v1${BASE}/${id}/download`
}

// ── Restore jobs ──────────────────────────────────────────────────────────────

export function listRestoreJobs(): Promise<RestoreJob[]> {
  return api.get<RestoreJob[]>(`${BASE}/restores/list`).then(r => r.data)
}

export function getRestoreJob(id: string): Promise<RestoreJob> {
  return api.get<RestoreJob>(`${BASE}/restores/${id}`).then(r => r.data)
}

export function startRestore(
  backupJobId: string,
  destination: RestoreDestination,
  destinationTenantId: string,
): Promise<RestoreJob> {
  return api.post<RestoreJob>(`${BASE}/restores`, {
    backupJobId,
    destination,
    destinationTenantId,
    confirmed: true,
  }).then(r => r.data)
}
