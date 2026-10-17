import { INestApplication } from '@nestjs/common';
import { authGet, authPost } from './auth.helper';

/**
 * Be in a shift of your branch: the one you are in, a new one, or — since a branch has one open
 * shift (one cash drawer) — the one already open there, joined.
 */
export async function ensureInShift(app: INestApplication, cookie: string, openBalance = 0): Promise<string> {
  const cur = (await authGet(app, '/api/v1/shifts/current', cookie).expect(200)).body;
  if (cur?.id) return cur.id as string;
  const opened = await authPost(app, '/api/v1/shifts/open', cookie, { openBalance });
  if (opened.status === 201) return opened.body.id as string;
  if (opened.status !== 409 || !opened.body?.data?.shiftId) throw new Error(`open shift: ${opened.status} ${JSON.stringify(opened.body)}`);
  await authPost(app, `/api/v1/shifts/${opened.body.data.shiftId}/join`, cookie, {}).expect(201);
  return opened.body.data.shiftId as string;
}

/** Count and close every shift open in a branch (owner's cookie), for a test that needs its own. */
export async function closeOpenShiftsOfBranch(app: INestApplication, ownerCookie: string, branchId: string) {
  const open = (await authGet(app, '/api/v1/shifts/open-now', ownerCookie).expect(200)).body as { id: string; branch?: { id: string } | null; expectedCashBalance?: number | null }[];
  for (const s of open.filter((x) => x.branch?.id === branchId)) {
    await authPost(app, `/api/v1/shifts/${s.id}/close`, ownerCookie, { closeBalance: Number(s.expectedCashBalance ?? 0), note: 'e2e cleanup' }).expect(201);
  }
}
