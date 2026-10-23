/**
 * Staff report SIM / package sales on LINE: link once with a code from the app, then "ais 250"
 * records the sale as theirs, charges the wallet and answers with what is left. A balance they
 * read off the carrier app that differs alerts the owners. LINE re-deliveries are not recorded twice.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authGet, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';
import { ensureInShift } from './helpers/shift.helper';
import { LineMessagingService } from '../src/line-messaging/line-messaging.service';

const SECRET = 'line-test-secret';

describe('SIM / package sales by LINE (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let cashier: string;
  const replies: string[] = [];
  const saved = { secret: process.env.LINE_CHANNEL_SECRET, oa: process.env.LINE_OA_ID, token: process.env.LINE_CHANNEL_ACCESS_TOKEN };
  const run = String(Date.now()).slice(-6);
  const staffLine = `Ustaff${run}`;
  const strangerLine = `Ustranger${run}`;
  let msg = 0;

  const send = (lineUserId: string, message: object) => {
    const body = JSON.stringify({ events: [{ type: 'message', replyToken: 'r', source: { userId: lineUserId }, message: { id: `${run}${++msg}`, ...message } }] });
    return request(app.getHttpServer()).post('/api/v1/public/line/webhook')
      .set('Content-Type', 'application/json')
      .set('x-line-signature', createHmac('sha256', SECRET).update(body).digest('base64'))
      .send(body).expect((r) => { if (r.status >= 300) throw new Error(`webhook ${r.status}`); });
  };
  const say = async (lineUserId: string, text: string) => {
    replies.length = 0;
    await send(lineUserId, { type: 'text', text });
    return replies.join('\n');
  };
  const sales = () => prisma.packageSale.count({ where: { tenantId: IDS.tenantA, note: { contains: 'LINE#' } } });

  beforeAll(async () => {
    process.env.LINE_CHANNEL_SECRET = SECRET;
    process.env.LINE_OA_ID = '@fixitpro';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    // Capture what would be sent to LINE instead of calling it
    const capture = async (_t: string, text: string) => { replies.push(text); return true; };
    jest.spyOn(LineMessagingService.prototype, 'replyMessage').mockImplementation(capture);
    jest.spyOn(LineMessagingService.prototype, 'replyWithChoices').mockImplementation(capture);
    jest.spyOn(LineMessagingService.prototype, 'pushCentral').mockImplementation(async (_u, text) => { replies.push(`PUSH ${text}`); return true; });

    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    cashier = (await loginAs(app, CREDS.cashierA1.email, CREDS.cashierA1.password)).cookies;
    const shiftId = await ensureInShift(app, cashier);
    await authPost(app, '/api/v1/carrier-wallet/topup', cashier, { carrier: 'AIS', amount: 1000, shiftId }).expect(201);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    for (const [k, v] of [['LINE_CHANNEL_SECRET', saved.secret], ['LINE_OA_ID', saved.oa], ['LINE_CHANNEL_ACCESS_TOKEN', saved.token]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await prisma.user.updateMany({ where: { lineChatId: { in: [staffLine, strangerLine] } }, data: { lineChatId: null } });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('LS-01: someone not linked gets nothing recorded; a forged code is refused', async () => {
    const before = await sales();
    await say(strangerLine, 'ais 250');
    expect(await sales()).toBe(before);
    expect(await say(strangerLine, 'เชื่อมบัญชี abc.def.ghijklmnopqrstuv')).toContain('หมดอายุหรือไม่ถูกต้อง');
  });

  it('LS-02: the app gives a link that opens the chat with the code; sending it links the staff', async () => {
    const info = (await authGet(app, '/api/v1/line/staff/link', cashier).expect(200)).body;
    expect(info).toMatchObject({ ready: true, linked: false, oaId: '@fixitpro', readsImages: false });
    const text = decodeURIComponent(info.url.split('?')[1]);
    expect(text).toMatch(/^เชื่อมบัญชี \S+$/);
    expect(await say(staffLine, text)).toContain('เชื่อม LINE กับบัญชี');
    const user = await prisma.user.findFirst({ where: { lineChatId: staffLine }, select: { email: true } });
    expect(user?.email).toBe(CREDS.cashierA1.email);
    expect((await authGet(app, '/api/v1/line/staff/link', cashier).expect(200)).body.linked).toBe(true);
  });

  it('LS-03: "ais 250 เหลือ 700" records the sale, and a balance that differs alerts the owners', async () => {
    const before = await sales();
    const reply = await say(staffLine, 'ais 250 0812345678 เหลือ 700');
    expect(await sales()).toBe(before + 1);
    expect(reply).toContain('บันทึกแล้ว AIS 250');
    expect(reply).toContain('ระบบเหลือ 757.5');
    expect(reply).toContain('⚠️');
    const sale = await prisma.packageSale.findFirst({ where: { tenantId: IDS.tenantA, note: { contains: 'LINE#' } }, orderBy: { createdAt: 'desc' } });
    expect(sale).toMatchObject({ cashierName: expect.any(String), phoneNumber: '0812345678', paymentMethod: 'CASH' });
    expect(Number(sale!.walletDeduction)).toBe(242.5);
    const alert = await prisma.notification.findFirst({ where: { tenantId: IDS.tenantA, type: 'SIM_WALLET_MISMATCH', entityId: sale!.receiptNumber } });
    expect(alert?.message).toContain('ขาด 57.5');
  });

  it('LS-04: a re-delivered message is not recorded twice', async () => {
    const body = JSON.stringify({ events: [{ type: 'message', replyToken: 'r', source: { userId: staffLine }, message: { id: `dup${run}`, type: 'text', text: 'ais 20' } }] });
    const post = () => request(app.getHttpServer()).post('/api/v1/public/line/webhook')
      .set('Content-Type', 'application/json')
      .set('x-line-signature', createHmac('sha256', SECRET).update(body).digest('base64')).send(body);
    const before = await sales();
    await post();
    replies.length = 0;
    await post();
    expect(await sales()).toBe(before + 1);
    expect(replies.join()).toContain('บันทึกไปแล้ว');
  });

  it('LS-05: a matching balance is confirmed; "ยอด" lists the wallets; a short wallet is refused', async () => {
    const wallet = await prisma.carrierWallet.findFirst({ where: { tenantId: IDS.tenantA, carrier: 'AIS' } });
    const left = Number(wallet!.balance) - 97;
    expect(await say(staffLine, `ais 100 เหลือ ${left}`)).toContain('ตรงกับแอปค่าย');
    expect(await say(staffLine, 'ยอด')).toMatch(/AIS\s+[\d,.]+ บาท/);
    const before = await sales();
    expect(await say(staffLine, 'dtac 5000')).toContain('ไม่เพียงพอ');
    expect(await sales()).toBe(before);
  });

  it('LS-07: the super admin sets the LINE keys in the web; values are never sent back', async () => {
    const email = `sa-line-${run}@e2e.test`;
    await prisma.user.create({ data: { email, name: 'SA LINE', password: await bcrypt.hash('E2eTest@2026!', 10), role: 'SUPER_ADMIN', isActive: true } });
    const admin = (await loginAs(app, email, 'E2eTest@2026!')).cookies;
    await authGet(app, '/api/v1/super-admin/settings/platform-keys', cashier).expect(403);
    const saved = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    try {
      expect((await authGet(app, '/api/v1/line/staff/link', cashier).expect(200)).body.ready).toBe(false);
      const res = await request(app.getHttpServer()).patch('/api/v1/super-admin/settings/platform-keys')
        .set('Cookie', admin).send({ LINE_CHANNEL_ACCESS_TOKEN: 'from-web' }).expect(200);
      expect(res.body.keys).toMatchObject({ LINE_CHANNEL_ACCESS_TOKEN: 'web', LINE_CHANNEL_SECRET: 'env' });
      expect(JSON.stringify(res.body)).not.toContain('from-web');
      expect(res.body.webhookUrl).toMatch(/\/api\/v1\/public\/line\/webhook$/);
      expect((await authGet(app, '/api/v1/line/staff/link', cashier).expect(200)).body.ready).toBe(true);
    } finally {
      await request(app.getHttpServer()).patch('/api/v1/super-admin/settings/platform-keys').set('Cookie', admin).send({ LINE_CHANNEL_ACCESS_TOKEN: '' }).expect(200);
      process.env.LINE_CHANNEL_ACCESS_TOKEN = saved;
    }
  });

  it('LS-06: without an AI key a screenshot gets a request to type instead', async () => {
    replies.length = 0;
    await send(staffLine, { type: 'image' });
    expect(replies.join()).toContain('พิมพ์ค่ายกับราคา');
  });
});
