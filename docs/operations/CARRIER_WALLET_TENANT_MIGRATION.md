# Carrier wallet → per-tenant migration (2026-10)

Migration: `backend/prisma/migrations/20261001000000_carrier_wallet_tenant`
Runs automatically when the backend container starts after a deploy (`prisma migrate deploy`).

## What it changes

- Adds a nullable `tenantId` column to `CarrierWallet`, `CarrierWalletMovement`, `PackageSale`, and fills it in.
- **Deletes nothing and changes no amount or balance.** Verified on a test DB: row counts and the sum of
  every balance / amount are identical before and after, and re-running the script changes nothing.
- Each existing wallet (with its balance) goes to the shop that used it most recently.
  Any other shop starts with a 0-balance wallet for that carrier and can fix it with a top-up or the
  shift-close reconcile. Old sales and movements stay visible to the shop that made them.

## 1. Preview on production (read only)

```bash
ssh root@91.98.151.10
CONTAINER="postgres-z9m1c1i9nr6kbyo4qn0vuv1b-174837653754"   # confirm with: docker ps | grep postgres
docker exec -i $CONTAINER psql -U fixitpro -d fixitpro < carrier-wallet-tenant-precheck.sql
```

(`scripts/migrations/carrier-wallet-tenant-precheck.sql` — copy it to the server first, e.g. with `scp`.)

- Table 1 shows each wallet, its balance and **which shop it will belong to**.
- Table 2 lists every shop that has used package sales / wallets.

If table 2 shows only your shop → nothing to decide, go ahead.
If several shops appear, or a wallet would go to the wrong shop, stop and ask before deploying.

## 2. Backup right before merging

```bash
bash /opt/fixitpro-backups/pg_backup_coolify.sh
ls -lh /opt/fixitpro-backups/db/ | tail -3      # confirm a fresh .sql.gz exists
```

Merge during a quiet time (no sales in progress).

## 3. After deploy

1. `https://fixitpro.in.th/login` loads and you can log in.
2. `/package-sales`: wallet balances per carrier match the dealer apps; today's sales list loads.
3. Make one small test sale or top-up and check the balance changes.

## If something goes wrong

- **Backend does not start** (migration error): the script is re-runnable. Check the logs in Coolify,
  then mark it rolled back and redeploy:
  `npx prisma migrate resolve --rolled-back 20261001000000_carrier_wallet_tenant` (inside the backend container).
- **Code problem after deploy**: revert the merge commit on `main`; the old code works with the new
  columns (they are only extra nullable fields).
- **Last resort**: restore the backup from step 2 — see `docs/operations/DATABASE_RESTORE.md`.
  Note that a restore loses anything recorded after the backup.
