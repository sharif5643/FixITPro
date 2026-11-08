-- Trial (14 days) gets the modules of the BUSINESS package, so a new shop tries everything it
-- could buy, then picks a package when the trial ends. Accounting and the owner hub stay per shop
-- (the super admin switches them on). Additive only: rows are added, nothing is changed or
-- removed, and a module the TRIAL package already has is left as it is.
INSERT INTO "PackageModule" ("packageKey", "moduleKey")
SELECT 'TRIAL', pm."moduleKey"
FROM "PackageModule" pm
WHERE pm."packageKey" = 'BUSINESS'
  AND pm."moduleKey" NOT IN ('accounting', 'owner_hub')
  AND EXISTS (SELECT 1 FROM "Package" p WHERE p."key" = 'TRIAL')
ON CONFLICT DO NOTHING;
