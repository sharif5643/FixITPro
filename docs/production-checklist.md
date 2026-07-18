# FixITPro — Production Deployment Checklist

**Version:** RC2-003  
**Complete this checklist before every production release.**  
Operator: ______________________  Date: ______________________

---

## Part A — Database Credentials

- [ ] **Non-superuser app role created**  
  Run `scripts/create-app-role.sql` as `postgres` superuser.  
  Confirm `fixitpro_app` role has `superuser=false` in the verification output.

- [ ] **Strong database password set**  
  `DB_PASSWORD` / `DATABASE_URL` does not contain `123456`, `password`, `postgres`, or any placeholder value.  
  Password length ≥ 16 characters.

- [ ] **`DATABASE_URL` uses `fixitpro_app`, not `postgres`**  
  `echo $DATABASE_URL | grep fixitpro_app` — must match.

- [ ] **Backend startup validation passes**  
  Start the backend in production mode and confirm no `FATAL:` messages in the log.  
  (Startup aborts automatically if password is weak or superuser is used in a cloud deployment.)

---

## Part B — Super Admin Credential

- [ ] **Super admin has been seeded**  
  ```sql
  SELECT email, role, "isActive" FROM "User" WHERE role = 'SUPER_ADMIN';
  ```
  Expected: one row with `isActive = true`.

- [ ] **Super admin password rotated from seed value**  
  Log in as SUPER_ADMIN and change the password via Settings → Change Password.  
  The seed password should no longer work after the first login.

- [ ] **Super admin password is not printed in logs**  
  Review startup and seed logs — no plaintext password should appear.

---

## Part C — Offsite Backup

- [ ] **S3 credentials configured** (if `BACKUP_S3_ENABLED=true`)  
  All `BACKUP_S3_*` env vars are set in Coolify UI / `.env.production`.

- [ ] **First offsite backup succeeds**  
  Trigger a manual backup: POST `/api/v1/backup` (as SUPER_ADMIN)  
  Verify the response includes `s3: { key: "...", size: N }`.  
  Also check the S3 bucket to confirm the file appears.

- [ ] **Failed offsite upload keeps local backup**  
  Temporarily set an invalid `BACKUP_S3_SECRET_ACCESS_KEY`, trigger a backup, verify:  
  - The `.sql` file exists in `/app/backups/`  
  - The response does NOT return a 500 error (local backup succeeded)  
  - A `BACKUP_FAILED` notification appears in the app (offsite only)  
  Restore the correct key afterward.

- [ ] **Retention policy applied**  
  After 7+ backups, confirm that old objects are removed from S3 while the 7 most recent are kept.

---

## Part D — Restore Test

- [ ] **Staging restore test completed**  
  Follow the staging restore procedure in `docs/disaster-recovery.md` § 9.  
  Result: PASS / FAIL  
  Date tested: ______________________  
  Backup file used: ______________________  
  Staging row counts match expectations: Yes / No  
  Notes: ______________________

- [ ] **Pre-restore backup created automatically**  
  Confirm the restore script created a `pre_restore_*` file before overwriting the staging DB.

---

## Part E — Security Gates

- [ ] **Backend startup validation passes** (JWT_SECRET, DB credentials, COOKIE_SECURE, CORS_ORIGIN)

- [ ] **Rate limiting active**  
  `curl -i http://<host>/health` — confirm `X-RateLimit-*` headers are absent (health skips throttle) and that more than 300 requests/min to a normal endpoint returns 429.

- [ ] **Security headers present on frontend**  
  `curl -I https://<frontend-domain>/` — confirm these headers appear:  
  - `X-Frame-Options: DENY`  
  - `X-Content-Type-Options: nosniff`  
  - `Referrer-Policy: strict-origin-when-cross-origin`  
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

- [ ] **No secrets in git history**  
  `git log --all --oneline | head -20` — confirm no `.env` files with real passwords were committed.  
  `git grep "123456"` — should return nothing in tracked files.

---

## Sign-off

| Check | Status | Notes |
|-------|--------|-------|
| Database role non-superuser | ☐ Pass / ☐ Fail | |
| Strong DB password | ☐ Pass / ☐ Fail | |
| Super admin seeded + rotated | ☐ Pass / ☐ Fail | |
| Offsite backup first upload | ☐ Pass / ☐ Fail | N/A if S3 disabled |
| Staging restore test | ☐ Pass / ☐ Fail | |
| Security headers | ☐ Pass / ☐ Fail | |
| No secrets in git | ☐ Pass / ☐ Fail | |

**All items must be PASS before the release is considered production-ready.**

Operator signature: ______________________  
Date: ______________________
