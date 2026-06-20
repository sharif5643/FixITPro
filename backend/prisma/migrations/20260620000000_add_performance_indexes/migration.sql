-- Performance: composite indexes for dashboard and kanban board queries
-- Sale: branchId + createdAt — used by DashboardService.getOverview() date-range queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_branchId_createdAt_idx" ON "Sale"("branchId", "createdAt");

-- Repair: branchId + status — used by kanban board and status filter queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Repair_branchId_status_idx" ON "Repair"("branchId", "status");

-- Repair: branchId + receivedAt — used by date-range repair list queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Repair_branchId_receivedAt_idx" ON "Repair"("branchId", "receivedAt");
