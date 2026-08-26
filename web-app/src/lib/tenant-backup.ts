/**
 * Tenant Backup & Restore API client
 * Calls /super-admin/backups/* endpoints on the backend.
 */

const BASE = '/api/v1/super-admin/backups'

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

// ── Helper ────────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText)
    throw new Error(body || res.statusText)
  }
  return res.json() as Promise<T>
}

// ── Tenant listing ────────────────────────────────────────────────────────────

export function listTenants(): Promise<TenantInfo[]> {
  return apiFetch(`${BASE}/tenants`)
}

// ── Backup jobs ───────────────────────────────────────────────────────────────

export function listBackupJobs(): Promise<BackupJob[]> {
  return apiFetch(BASE)
}

export function getBackupJob(id: string): Promise<BackupJob> {
  return apiFetch(`${BASE}/${id}`)
}

export function startBackup(tenantIds: string[]): Promise<BackupJob> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify({ tenantIds }) })
}

export function validateBackup(id: string): Promise<ValidationResult> {
  return apiFetch(`${BASE}/${id}/validate`, { method: 'POST' })
}

export function downloadUrl(id: string): string {
  return `${BASE}/${id}/download`
}

// ── Restore jobs ──────────────────────────────────────────────────────────────

export function listRestoreJobs(): Promise<RestoreJob[]> {
  return apiFetch(`${BASE}/restores/list`)
}

export function getRestoreJob(id: string): Promise<RestoreJob> {
  return apiFetch(`${BASE}/restores/${id}`)
}

export function startRestore(
  backupJobId: string,
  destination: RestoreDestination,
  destinationTenantId: string,
): Promise<RestoreJob> {
  return apiFetch(`${BASE}/restores`, {
    method: 'POST',
    body: JSON.stringify({ backupJobId, destination, destinationTenantId, confirmed: true }),
  })
}
