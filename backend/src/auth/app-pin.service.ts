import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';

/** Wrong PINs in a row before the app signs the person out (they sign in again with the password) */
export const APP_PIN_MAX_TRIES = 5;

/** PINs anyone would try first */
export function weakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  return '0123456789012'.includes(pin) || '9876543210987'.includes(pin);
}

/**
 * The PIN that opens the staff app. Kept on the server (hashed), so it never sits on the phone and
 * wrong tries are counted per person, not per device.
 */
@Injectable()
export class AppPinService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { appPinHash: true } });
    return { hasPin: !!user?.appPinHash, maxTries: APP_PIN_MAX_TRIES };
  }

  async set(userId: string, pin: string, proof: { currentPin?: string; password?: string }) {
    if (weakPin(pin)) throw new BadRequestException('PIN นี้เดาง่ายเกินไป — เลือกตัวเลขอื่น');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { appPinHash: true, password: true } });
    if (!user) throw new UnauthorizedException();
    // Replacing a PIN needs the current one, or the account password when it was forgotten
    if (user.appPinHash) {
      const ok = proof.currentPin
        ? await bcrypt.compare(proof.currentPin, user.appPinHash)
        : proof.password ? await bcrypt.compare(proof.password, user.password) : false;
      if (!ok) throw new BadRequestException(proof.password ? 'รหัสผ่านไม่ถูกต้อง' : 'PIN เดิมไม่ถูกต้อง');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data:  { appPinHash: await bcrypt.hash(pin, 10), appPinFailures: 0 },
    });
    return { hasPin: true };
  }

  /**
   * Right PIN: tries reset. Wrong: counted; at the limit the PIN is removed and every session of
   * this person ends, so the phone needs the password again (and a new PIN after that).
   */
  async verify(userId: string, pin: string): Promise<{ ok: true } | { ok: false; triesLeft: number; signedOut: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { appPinHash: true } });
    if (!user?.appPinHash) throw new BadRequestException('ยังไม่ได้ตั้ง PIN');
    if (await bcrypt.compare(pin, user.appPinHash)) {
      await this.prisma.user.update({ where: { id: userId }, data: { appPinFailures: 0 } });
      return { ok: true };
    }
    const { appPinFailures } = await this.prisma.user.update({
      where:  { id: userId },
      data:   { appPinFailures: { increment: 1 } },
      select: { appPinFailures: true },
    });
    if (appPinFailures < APP_PIN_MAX_TRIES) {
      return { ok: false, triesLeft: APP_PIN_MAX_TRIES - appPinFailures, signedOut: false };
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { appPinHash: null, appPinFailures: 0 } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: false, triesLeft: 0, signedOut: true };
  }
}
