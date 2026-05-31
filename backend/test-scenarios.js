/**
 * Role + Branch Scenario Tests — DEV only
 * Runs against http://localhost:3000/api/v1
 */
const http = require('http');

const BASE = 'http://localhost:3000/api/v1';

// ── helpers ───────────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname: 'localhost',
      port: 3000,
      path: `/api/v1${path}`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

const pass = (label) => console.log(`  ✅  ${label}`);
const fail = (label, detail) => console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`);
const info = (label) => console.log(`  ℹ️   ${label}`);
const section = (n, title) => console.log(`\n━━━ S${n}: ${title} ━━━`);

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  // ── Login as OWNER ──────────────────────────────────────────────────────────
  const loginRes = await request('POST', '/auth/login', {
    email: 'owner@fixitpro.com',
    password: 'TestOwner123',
  });
  if (!loginRes.body.accessToken) {
    console.log('FATAL: Owner login failed —', JSON.stringify(loginRes.body));
    process.exit(1);
  }
  const ownerToken = loginRes.body.accessToken;
  const ownerId    = loginRes.body.user?.id;
  info(`Logged in as OWNER  id=${ownerId}`);

  // ── Get branches ────────────────────────────────────────────────────────────
  const branchRes = await request('GET', '/branches', null, ownerToken);
  const branches  = branchRes.body;
  if (!Array.isArray(branches) || branches.length === 0) {
    console.log('FATAL: No branches found — create at least one branch first');
    process.exit(1);
  }
  const branchA = branches[0];
  const branchB = branches[1] ?? null;
  info(`BranchA: id=${branchA.id}  name="${branchA.name}"`);
  if (branchB) info(`BranchB: id=${branchB.id}  name="${branchB.name}"`);
  else         info('BranchB: not available (only one branch in DB)');

  // ── Cleanup helpers: track created user ids ─────────────────────────────────
  const createdUserIds = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // S1 — Create STOCK_STAFF without branch → blocked
  // ═══════════════════════════════════════════════════════════════════════════
  section(1, 'Create STAFF without branch → expect 400');
  const s1 = await request('POST', '/users', {
    name: 'Test Staff NoBranch',
    email: `s1-nob-${Date.now()}@test.com`,
    password: 'Pass1234!',
    role: 'STOCK_STAFF',
  }, ownerToken);
  if (s1.status === 400 && s1.body.message?.includes('ต้องระบุสาขา')) {
    pass(`STOCK_STAFF without branch → 400 "${s1.body.message}"`);
  } else {
    fail('STOCK_STAFF without branch should be 400', JSON.stringify(s1.body));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S2 — Create MANAGER without branch → blocked
  // ═══════════════════════════════════════════════════════════════════════════
  section(2, 'Create MANAGER without branch → expect 400');
  const s2 = await request('POST', '/users', {
    name: 'Test Mgr NoBranch',
    email: `s2-nob-${Date.now()}@test.com`,
    password: 'Pass1234!',
    role: 'MANAGER',
  }, ownerToken);
  if (s2.status === 400 && s2.body.message?.includes('ต้องระบุสาขา')) {
    pass(`MANAGER without branch → 400 "${s2.body.message}"`);
  } else {
    fail('MANAGER without branch should be 400', JSON.stringify(s2.body));
  }

  // Also check CASHIER and TECHNICIAN
  for (const role of ['CASHIER', 'TECHNICIAN']) {
    const r = await request('POST', '/users', {
      name: `Test ${role} NoBranch`,
      email: `s2-${role.toLowerCase()}-${Date.now()}@test.com`,
      password: 'Pass1234!',
      role,
    }, ownerToken);
    if (r.status === 400) pass(`${role} without branch → 400`);
    else fail(`${role} without branch should be 400`, JSON.stringify(r.body));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S3 — Create OWNER without branch → allowed
  // ═══════════════════════════════════════════════════════════════════════════
  section(3, 'Create OWNER without branch → expect 201');
  const s3Email = `s3-owner-${Date.now()}@test.com`;
  const s3 = await request('POST', '/users', {
    name: 'Test Owner NoBranch',
    email: s3Email,
    password: 'Pass1234!',
    role: 'OWNER',
  }, ownerToken);
  if (s3.status === 201 || s3.status === 200) {
    pass(`OWNER without branch → ${s3.status} (allowed)`);
    if (s3.body.id) createdUserIds.push(s3.body.id);
  } else {
    fail('OWNER without branch should succeed', JSON.stringify(s3.body));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S4 — Create STAFF on Branch A, verify branch scoping
  // ═══════════════════════════════════════════════════════════════════════════
  section(4, 'STAFF on Branch A — branch data scoping');

  // Create STAFF user on Branch A
  const staffEmail = `s4-staff-${Date.now()}@test.com`;
  const staffPw    = 'Staff1234!';
  const createStaff = await request('POST', '/users', {
    name: 'Test Staff BranchA',
    email: staffEmail,
    password: staffPw,
    role: 'STOCK_STAFF',
    branchId: branchA.id,
  }, ownerToken);

  if (createStaff.status !== 201 && createStaff.status !== 200) {
    fail('Could not create STAFF on Branch A', JSON.stringify(createStaff.body));
  } else {
    const staffId = createStaff.body.id;
    if (staffId) createdUserIds.push(staffId);
    info(`Created STAFF id=${staffId} on branchId=${branchA.id}`);

    // Login as staff
    const staffLogin = await request('POST', '/auth/login', {
      email: staffEmail,
      password: staffPw,
    });
    if (!staffLogin.body.accessToken) {
      fail('STAFF login failed', JSON.stringify(staffLogin.body));
    } else {
      const staffToken = staffLogin.body.accessToken;
      const staffBranchIdInResponse = staffLogin.body.user?.branchId;
      if (staffBranchIdInResponse === branchA.id) {
        pass(`Login response includes branchId=${staffBranchIdInResponse}`);
      } else {
        fail(`Login response branchId="${staffBranchIdInResponse}" expected "${branchA.id}"`);
      }

      // 4a: GET /sales — staff sees only Branch A (branchId forced from JWT)
      const salesA = await request('GET', '/sales', null, staffToken);
      const salesAll = await request('GET', '/sales', null, ownerToken);
      if (salesA.status === 200) {
        // Verify no Branch B records leaked
        const allBranchIds = (salesA.body ?? []).map((s) => s.branchId);
        const hasBranchB   = branchB && allBranchIds.some((b) => b === branchB.id);
        if (hasBranchB) fail('Sales: Branch B data leaked to Branch A staff');
        else            pass(`Sales scoped to branchId=${branchA.id} (${(salesA.body??[]).length} records, no Branch B leak)`);
      } else {
        info(`Sales returned ${salesA.status} (may need repair data in DB)`);
      }

      // 4b: Try to inject branchId via query string (should be ignored for non-OWNER)
      if (branchB) {
        const salesInjected = await request('GET', `/sales?branchId=${branchB.id}`, null, staffToken);
        const injectedBranchIds = (salesInjected.body ?? []).map((s) => s.branchId);
        const hasBranchBData    = injectedBranchIds.some((b) => b === branchB.id);
        if (hasBranchBData) {
          fail('Branch B query injection worked — scope bypass possible!');
        } else {
          pass(`Query injection blocked: ?branchId=${branchB.id} ignored, JWT branchId enforced`);
        }
      } else {
        info('Branch B injection test skipped (only one branch in DB)');
      }

      // 4c: Repairs scoping
      const repairsA = await request('GET', '/repairs', null, staffToken);
      if (repairsA.status === 200) {
        const repBranchIds  = (repairsA.body ?? []).map((r) => r.branchId);
        const hasBranchBRep = branchB && repBranchIds.some((b) => b === branchB.id);
        if (hasBranchBRep) fail('Repairs: Branch B data leaked to Branch A staff');
        else               pass(`Repairs scoped correctly (${(repairsA.body??[]).length} records)`);
      } else {
        info(`Repairs returned ${repairsA.status}`);
      }

      // 4d: Outstanding repairs scoping
      const outstanding = await request('GET', '/repairs/outstanding', null, staffToken);
      if (outstanding.status === 200) {
        const outBranchIds = (outstanding.body ?? []).map((r) => r.branchId);
        const hasBranchBOut = branchB && outBranchIds.some((b) => b === branchB.id);
        if (hasBranchBOut) fail('Outstanding repairs: Branch B data leaked');
        else               pass(`Outstanding repairs scoped correctly (${(outstanding.body??[]).length} records)`);
      }

      // 4e: Shifts scoping
      const shiftsA = await request('GET', '/shifts', null, staffToken);
      if (shiftsA.status === 200) {
        const shBranchIds  = (shiftsA.body ?? []).map((s) => s.branchId);
        const hasBranchBSh = branchB && shBranchIds.some((b) => b === branchB.id);
        if (hasBranchBSh) fail('Shifts: Branch B data leaked to Branch A staff');
        else              pass(`Shifts scoped correctly (${(shiftsA.body??[]).length} records)`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S5 — OWNER sees all branches
  // ═══════════════════════════════════════════════════════════════════════════
  section(5, 'OWNER sees all branch data (ทุกสาขา)');
  const ownerSales   = await request('GET', '/sales', null, ownerToken);
  const ownerRepairs = await request('GET', '/repairs', null, ownerToken);
  if (ownerSales.status === 200) {
    pass(`OWNER GET /sales → 200 (${(ownerSales.body??[]).length} total records, unrestricted)`);
  }
  if (ownerRepairs.status === 200) {
    pass(`OWNER GET /repairs → 200 (${(ownerRepairs.body??[]).length} total records)`);
  }
  // OWNER can also pass explicit branchId filter
  const ownerSalesFiltered = await request('GET', `/sales?branchId=${branchA.id}`, null, ownerToken);
  if (ownerSalesFiltered.status === 200) {
    pass(`OWNER can filter by branchId query param → 200 (${(ownerSalesFiltered.body??[]).length} records for branchA)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S6 — Apply role preset to CASHIER
  // ═══════════════════════════════════════════════════════════════════════════
  section(6, 'Apply role preset to CASHIER');

  // Get permissions before
  const permsBefore = await request('GET', '/permissions/roles', null, ownerToken);
  const cashierBefore = (permsBefore.body ?? []).find((r) => r.role === 'CASHIER');
  info(`CASHIER permissions before: ${cashierBefore?.permissions?.length ?? '?'}`);

  // Apply preset
  const applyRes = await request('POST', '/permissions/roles/CASHIER/apply-preset', null, ownerToken);
  if (applyRes.status === 200 || applyRes.status === 201) {
    pass(`POST /permissions/roles/CASHIER/apply-preset → ${applyRes.status}`);
  } else {
    fail('Apply preset failed', JSON.stringify(applyRes.body));
  }

  // Get permissions after
  const permsAfter = await request('GET', '/permissions/roles', null, ownerToken);
  const cashierAfter = (permsAfter.body ?? []).find((r) => r.role === 'CASHIER');
  const cashierPerms = cashierAfter?.permissions ?? [];
  info(`CASHIER permissions after: ${cashierPerms.length} — [${cashierPerms.join(', ')}]`);

  const expectedCashierPerms = ['products.view','sales.create','sales.discount','repair.create','repair.edit','serials.manage','warranty.view','notification.view'];
  const hasAll = expectedCashierPerms.every((p) => cashierPerms.includes(p));
  const hasExtra = cashierPerms.some((p) => !expectedCashierPerms.includes(p));
  if (hasAll && !hasExtra) {
    pass(`CASHIER preset applied correctly — exact match (${cashierPerms.length} perms)`);
  } else if (hasAll) {
    pass(`CASHIER has all expected perms (has ${cashierPerms.length - expectedCashierPerms.length} extra)`);
  } else {
    const missing = expectedCashierPerms.filter((p) => !cashierPerms.includes(p));
    fail(`CASHIER missing perms: ${missing.join(', ')}`);
  }
  // Verify CASHIER does NOT have reports.view
  if (!cashierPerms.includes('reports.view')) {
    pass('CASHIER correctly does NOT have reports.view');
  } else {
    fail('CASHIER should NOT have reports.view after preset');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S7 — Apply role preset to TECHNICIAN, check report access blocked
  // ═══════════════════════════════════════════════════════════════════════════
  section(7, 'Apply role preset to TECHNICIAN — no reports access');

  const applyTech = await request('POST', '/permissions/roles/TECHNICIAN/apply-preset', null, ownerToken);
  if (applyTech.status === 200 || applyTech.status === 201) {
    pass(`POST /permissions/roles/TECHNICIAN/apply-preset → ${applyTech.status}`);
  } else {
    fail('Apply preset failed', JSON.stringify(applyTech.body));
  }

  const permsTech = await request('GET', '/permissions/roles', null, ownerToken);
  const techPerms = (permsTech.body ?? []).find((r) => r.role === 'TECHNICIAN')?.permissions ?? [];
  info(`TECHNICIAN permissions: [${techPerms.join(', ')}]`);

  // Should have repair perms
  const techExpected = ['repair.create','repair.edit','repair.close','repair.approve_estimate','technician.view'];
  const techHasRepair = techExpected.every((p) => techPerms.includes(p));
  if (techHasRepair) pass(`TECHNICIAN has all repair/tech permissions`);
  else fail(`TECHNICIAN missing: ${techExpected.filter((p) => !techPerms.includes(p)).join(', ')}`);

  // Should NOT have reports.view
  if (!techPerms.includes('reports.view')) {
    pass('TECHNICIAN does NOT have reports.view (profit page hidden in nav)');
  } else {
    fail('TECHNICIAN should NOT have reports.view');
  }

  // Create a TECHNICIAN user to test actual report access
  const techEmail = `s7-tech-${Date.now()}@test.com`;
  const techPw    = 'Tech1234!';
  const createTech = await request('POST', '/users', {
    name: 'Test Technician S7',
    email: techEmail,
    password: techPw,
    role: 'TECHNICIAN',
    branchId: branchA.id,
  }, ownerToken);
  if (createTech.status === 200 || createTech.status === 201) {
    if (createTech.body.id) createdUserIds.push(createTech.body.id);
    const techLogin = await request('POST', '/auth/login', { email: techEmail, password: techPw });
    if (techLogin.body.accessToken) {
      const techToken = techLogin.body.accessToken;
      // Try to access profit report — should be 403
      const reportRes = await request('GET', '/reports/profit?startDate=2026-01-01&endDate=2026-12-31', null, techToken);
      if (reportRes.status === 403) {
        pass(`TECHNICIAN GET /reports/profit → 403 Forbidden (backend enforced)`);
      } else {
        fail(`TECHNICIAN should get 403 on /reports/profit, got ${reportRes.status}`, JSON.stringify(reportRes.body).slice(0, 100));
      }
      // Try daily-closing — should also be 403
      const closingRes = await request('GET', '/reports/daily-closing', null, techToken);
      if (closingRes.status === 403) {
        pass(`TECHNICIAN GET /reports/daily-closing → 403 Forbidden`);
      } else {
        fail(`TECHNICIAN should get 403 on /reports/daily-closing, got ${closingRes.status}`);
      }
      // Repairs should be accessible
      const repairRes = await request('GET', '/repairs', null, techToken);
      if (repairRes.status === 200) {
        pass(`TECHNICIAN GET /repairs → 200 (can view repairs)`);
      } else {
        fail(`TECHNICIAN should access /repairs, got ${repairRes.status}`);
      }
    } else {
      fail('TECHNICIAN login failed', JSON.stringify(techLogin.body));
    }
  } else {
    fail('Could not create TECHNICIAN for S7', JSON.stringify(createTech.body));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S8 — Explicitly trigger & verify audit log entries
  // ═══════════════════════════════════════════════════════════════════════════
  section(8, 'Audit log entries — USER_BRANCH_ASSIGNED / USER_ROLE_CHANGED');

  // User A: OWNER (no branch required) — used only for PATCH /branch → USER_BRANCH_ASSIGNED
  const auditOwnerEmail = `s8-owner-${Date.now()}@test.com`;
  const auditOwnerRes = await request('POST', '/users', {
    name: 'Audit Owner S8',
    email: auditOwnerEmail,
    password: 'Audit1234!',
    role: 'OWNER',
  }, ownerToken);
  const auditOwnerId = auditOwnerRes.body.id;
  info(`Created OWNER for branch-assign test id=${auditOwnerId}`);

  // Trigger USER_BRANCH_ASSIGNED: PATCH :id/branch (null → branchA = a real change)
  const assignBranchRes = await request('PATCH', `/users/${auditOwnerId}/branch`, { branchId: branchA.id }, ownerToken);
  if (assignBranchRes.status === 200) {
    info('PATCH /branch → 200 — USER_BRANCH_ASSIGNED should be logged');
  } else {
    info(`PATCH /branch returned ${assignBranchRes.status}: ${JSON.stringify(assignBranchRes.body)}`);
  }
  if (auditOwnerId) createdUserIds.push(auditOwnerId);

  // User B: CASHIER (with branch) — used for PUT role change → USER_ROLE_CHANGED
  const auditCashierEmail = `s8-cashier-${Date.now()}@test.com`;
  const auditCashierRes = await request('POST', '/users', {
    name: 'Audit Cashier S8',
    email: auditCashierEmail,
    password: 'Audit1234!',
    role: 'CASHIER',
    branchId: branchA.id,
  }, ownerToken);
  const auditCashierId = auditCashierRes.body.id;
  info(`Created CASHIER for role-change test id=${auditCashierId}`);

  // Trigger USER_ROLE_CHANGED: PUT :id changing CASHIER → MANAGER (same branch, no guard block)
  const roleChangeRes = await request('PUT', `/users/${auditCashierId}`, {
    name: 'Audit Cashier S8',
    email: auditCashierEmail,
    role: 'MANAGER',
    branchId: branchA.id,
  }, ownerToken);
  if (roleChangeRes.status === 200) {
    info('PUT /users/:id role CASHIER→MANAGER → 200 — USER_ROLE_CHANGED should be logged');
  } else {
    info(`PUT /users/:id returned ${roleChangeRes.status}: ${JSON.stringify(roleChangeRes.body)}`);
  }
  if (auditCashierId) createdUserIds.push(auditCashierId);

  // Fetch recent audit logs
  const auditRes = await request('GET', '/audit-logs?limit=100', null, ownerToken);
  const auditLogs = auditRes.body?.items ?? auditRes.body ?? [];

  const checkAction = (action) => {
    const found = auditLogs.some((l) => l.action === action);
    if (found) pass(`Audit log "${action}" found`);
    else       fail(`Audit log "${action}" NOT found`);
  };

  checkAction('USER_BRANCH_ASSIGNED');
  checkAction('USER_ROLE_CHANGED');
  checkAction('ROLE_PERMISSIONS_SET');   // from S6/S7 apply-preset calls

  // ═══════════════════════════════════════════════════════════════════════════
  // S9 — Check notifications
  // ═══════════════════════════════════════════════════════════════════════════
  section(9, 'Notifications');
  const notifRes = await request('GET', '/notifications?limit=50', null, ownerToken);
  const notifs   = notifRes.body?.items ?? notifRes.body ?? [];

  const checkNotif = (type) => {
    const found = notifs.some((n) => n.type === type);
    if (found) pass(`Notification "${type}" found`);
    else       fail(`Notification "${type}" NOT found (may not have been triggered yet)`);
  };

  checkNotif('USER_ASSIGNED_TO_BRANCH');
  checkNotif('ROLE_PERMISSION_CHANGED');

  // ═══════════════════════════════════════════════════════════════════════════
  // Cleanup — deactivate test users
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n━━━ Cleanup ━━━');
  for (const uid of createdUserIds) {
    const r = await request('PATCH', `/users/${uid}/toggle`, null, ownerToken);
    if (r.status === 200) info(`Deactivated test user ${uid}`);
    else info(`Could not deactivate ${uid} (${r.status}) — may be OWNER or already inactive`);
  }

  console.log('\n━━━ Done ━━━\n');
}

run().catch((e) => { console.error('Unhandled error:', e); process.exit(1); });
