-- A shop can now send its own renewal payment with a transfer slip; the Super Admin
-- checks it like any other payment. Two nullable columns, nothing existing changes.
ALTER TABLE "TenantPayment" ADD COLUMN IF NOT EXISTS "slipUrl" TEXT;
ALTER TABLE "TenantPayment" ADD COLUMN IF NOT EXISTS "submittedById" TEXT;

-- Where shops pay FixITPro, set by the Super Admin on the platform's own settings row
-- (tenantId IS NULL). Free text: bank, account number, account name.
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "renewalBankInfo" TEXT;
