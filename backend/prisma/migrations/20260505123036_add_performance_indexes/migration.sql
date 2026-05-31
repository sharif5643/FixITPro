-- Performance Indexes Migration
-- Adds indexes on all commonly-filtered foreign keys and status fields

-- User
CREATE INDEX IF NOT EXISTS "User_role_isActive_idx" ON "User"("role", "isActive");

-- Shift
CREATE INDEX IF NOT EXISTS "Shift_userId_idx"   ON "Shift"("userId");
CREATE INDEX IF NOT EXISTS "Shift_isActive_idx" ON "Shift"("isActive");
CREATE INDEX IF NOT EXISTS "Shift_openedAt_idx" ON "Shift"("openedAt");

-- Sale
CREATE INDEX IF NOT EXISTS "Sale_createdAt_idx"        ON "Sale"("createdAt");
CREATE INDEX IF NOT EXISTS "Sale_userId_createdAt_idx"  ON "Sale"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Sale_customerId_idx"        ON "Sale"("customerId");
CREATE INDEX IF NOT EXISTS "Sale_shiftId_idx"           ON "Sale"("shiftId");
CREATE INDEX IF NOT EXISTS "Sale_status_idx"            ON "Sale"("status");

-- SaleItem
CREATE INDEX IF NOT EXISTS "SaleItem_saleId_idx"    ON "SaleItem"("saleId");
CREATE INDEX IF NOT EXISTS "SaleItem_productId_idx" ON "SaleItem"("productId");

-- StockMovement
CREATE INDEX IF NOT EXISTS "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "StockMovement_type_createdAt_idx"      ON "StockMovement"("type", "createdAt");

-- Repair
CREATE INDEX IF NOT EXISTS "Repair_status_receivedAt_idx" ON "Repair"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "Repair_customerId_idx"         ON "Repair"("customerId");
CREATE INDEX IF NOT EXISTS "Repair_technicianId_idx"       ON "Repair"("technicianId");
CREATE INDEX IF NOT EXISTS "Repair_receivedAt_idx"         ON "Repair"("receivedAt");

-- RepairPart
CREATE INDEX IF NOT EXISTS "RepairPart_repairId_idx"   ON "RepairPart"("repairId");
CREATE INDEX IF NOT EXISTS "RepairPart_productId_idx"  ON "RepairPart"("productId");

-- PurchaseOrder
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_createdAt_idx" ON "PurchaseOrder"("supplierId", "createdAt");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx"               ON "PurchaseOrder"("status");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_paymentStatus_idx"        ON "PurchaseOrder"("paymentStatus");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_createdAt_idx"            ON "PurchaseOrder"("createdAt");

-- SupplierPayment
CREATE INDEX IF NOT EXISTS "SupplierPayment_purchaseOrderId_idx" ON "SupplierPayment"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "SupplierPayment_paidAt_idx"          ON "SupplierPayment"("paidAt");

-- PurchaseOrderItem
CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_productId_idx"       ON "PurchaseOrderItem"("productId");

-- SerialNumber
CREATE INDEX IF NOT EXISTS "SerialNumber_productId_status_idx" ON "SerialNumber"("productId", "status");
CREATE INDEX IF NOT EXISTS "SerialNumber_status_idx"           ON "SerialNumber"("status");
CREATE INDEX IF NOT EXISTS "SerialNumber_saleItemId_idx"       ON "SerialNumber"("saleItemId");

-- Claim
CREATE INDEX IF NOT EXISTS "Claim_status_createdAt_idx"  ON "Claim"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Claim_serialNumberId_idx"    ON "Claim"("serialNumberId");
CREATE INDEX IF NOT EXISTS "Claim_customerId_idx"        ON "Claim"("customerId");
CREATE INDEX IF NOT EXISTS "Claim_createdById_idx"       ON "Claim"("createdById");

-- ClaimStatusHistory
CREATE INDEX IF NOT EXISTS "ClaimStatusHistory_claimId_idx"    ON "ClaimStatusHistory"("claimId");
CREATE INDEX IF NOT EXISTS "ClaimStatusHistory_createdById_idx" ON "ClaimStatusHistory"("createdById");

-- RolePermission
CREATE INDEX IF NOT EXISTS "RolePermission_role_idx" ON "RolePermission"("role");
