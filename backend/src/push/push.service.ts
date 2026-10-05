import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'crypto';
import { PrismaService } from '../database/prisma.service';

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/**
 * Phone notifications through Firebase Cloud Messaging (HTTP v1), for the account signed in on
 * each phone. Configured by FIREBASE_SERVICE_ACCOUNT (the service-account JSON, as is or base64)
 * on the server; without it nothing is sent and nothing fails. Never throws.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private account: ServiceAccount | null | undefined;
  private access: { token: string; expiresAt: number } | null = null;

  constructor(private prisma: PrismaService) {}

  private serviceAccount(): ServiceAccount | null {
    if (this.account !== undefined) return this.account;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
    try {
      const json = raw ? JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) : null;
      this.account = json?.project_id && json?.client_email && json?.private_key ? json : null;
    } catch {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT is not valid JSON — phone notifications are off');
      this.account = null;
    }
    return this.account;
  }

  isConfigured() {
    return !!this.serviceAccount();
  }

  /** OAuth access token for FCM, from a JWT signed with the service account key (cached ~1 h). */
  private async accessToken(sa: ServiceAccount): Promise<string | null> {
    if (this.access && this.access.expiresAt > Date.now() + 60_000) return this.access.token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
    const signature = b64url(createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key));
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      this.logger.warn(`FCM auth failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const body = await res.json() as { access_token: string; expires_in: number };
    this.access = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  /** Notify every phone signed in to this account. Returns how many accepted it. */
  async sendToUser(userId: string, msg: { title: string; body: string; data?: Record<string, string> }): Promise<number> {
    try {
      const sa = this.serviceAccount();
      if (!sa) return 0;
      const devices = await this.prisma.pushDevice.findMany({ where: { userId }, select: { id: true, token: true } });
      if (!devices.length) return 0;
      const token = await this.accessToken(sa);
      if (!token) return 0;
      let sent = 0;
      for (const d of devices) {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            message: {
              token: d.token,
              notification: { title: msg.title, body: msg.body },
              data: msg.data ?? {},
              android: { priority: 'HIGH', notification: { channel_id: 'jobs', sound: 'default', default_vibrate_timings: true } },
            },
          }),
          signal: AbortSignal.timeout(8_000),
        }).catch((e) => { this.logger.warn(`FCM send failed: ${(e as Error).message}`); return null; });
        if (!res) continue;
        if (res.ok) { sent++; continue; }
        const text = await res.text();
        // The app was uninstalled or the token replaced: forget this phone
        if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) {
          await this.prisma.pushDevice.delete({ where: { id: d.id } }).catch(() => {});
        } else {
          this.logger.warn(`FCM send HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
      }
      return sent;
    } catch (err) {
      this.logger.warn(`Push to user ${userId} failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** This phone now belongs to this account (a phone moves to whoever signs in on it). */
  async register(userId: string, tenantId: string | null, token: string, app?: string, platform = 'android') {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { token, userId, tenantId, app: app ?? null, platform },
      update: { userId, tenantId, app: app ?? null, platform, lastSeenAt: new Date() },
    });
    return { ok: true, configured: this.isConfigured() };
  }

  /** Signing out: this phone stops getting this account's notifications. */
  async unregister(userId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { token, userId } });
    return { ok: true };
  }

  /** Signed out on this phone (the token comes with the logout call; no account needed). */
  async forgetPhone(token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { token } });
  }
}
