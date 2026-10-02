/**
 * Public repair tracking (/track) — no login.
 * Phone search must not hand out full ticket numbers: before, typing any phone number
 * listed tickets that opened the customer's name, balance and photos.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { createTestApp } from './helpers/app.helper';
import { loginAs, authPost } from './helpers/auth.helper';
import { CREDS, IDS, seedTestData, testPrisma } from './helpers/seed.helper';

describe('Public tracking (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ticket: string;
  // unique 10-digit number per run so other suites' customers never match
  const phone = `09${Date.now().toString().slice(-8)}`;

  const track = (query: Record<string, string>) =>
    request(app.getHttpServer()).get('/api/v1/public/tracking/repair').query(query);

  beforeAll(async () => {
    prisma = testPrisma();
    await seedTestData(prisma);
    app = await createTestApp();
    const ownerB = (await loginAs(app, CREDS.ownerB.email, CREDS.ownerB.password)).cookies;
    const repair = await authPost(app, '/api/v1/repairs', ownerB, {
      deviceBrand: 'Apple', deviceModel: 'iPhone 13', issue: 'screen', estimateCost: 1200,
      branchId: IDS.branchB1, customerName: 'สมชาย ใจดี', customerPhone: phone,
    }).expect(201);
    ticket = repair.body.ticketNumber;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('PT-01: phone search lists status and device with a masked ticket only', async () => {
    const res = await track({ phone }).expect(200);
    expect(res.body).toHaveLength(1);
    const row = res.body[0];
    expect(row.deviceModel).toBe('iPhone 13');
    expect(row.ticketNumber).toBeUndefined();
    expect(row.maskedTicket).toMatch(/•+..$/);
    expect(JSON.stringify(res.body)).not.toContain(ticket.split('-').pop());
    expect(JSON.stringify(res.body)).not.toContain('สมชาย');
  });

  it('PT-02: ticket alone shows public fields only', async () => {
    const res = await track({ ticketNumber: ticket }).expect(200);
    expect(res.body.phoneVerified).toBe(false);
    expect(res.body.customerName).toBeNull();
    expect(res.body.outstanding).toBeNull();
  });

  it('PT-03: ticket + phone shows details with a masked name', async () => {
    const res = await track({ ticketNumber: ticket, phone }).expect(200);
    expect(res.body.phoneVerified).toBe(true);
    expect(res.body.customerName).toBe('สม*** ใ***');
    expect(res.body.outstanding).toBe(1200);
  });

  it('PT-04: ticket + a short phone fragment is rejected', async () => {
    await track({ ticketNumber: ticket, phone: phone.slice(-1) }).expect(400);
    await track({ ticketNumber: ticket, phone: phone.slice(-4) }).expect(400);
  });

  it('PT-05: a customer can check more than a few times an hour', async () => {
    for (let i = 0; i < 6; i++) {
      await track({ ticketNumber: ticket }).expect(200);
    }
  });
});
