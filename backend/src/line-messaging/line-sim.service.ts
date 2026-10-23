import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CarrierWalletService } from '../carrier-wallet/carrier-wallet.service';
import { loadRolePermissions } from '../permissions/role-permissions';
import { tenantWriteBlock, TENANT_BLOCK_MESSAGE } from '../common/tenant-access';
import { LineMessagingService } from './line-messaging.service';
import { centralLine } from './line-central';
import { HELP_TEXT, LINK_PREFIX, parseLineSim, type Carrier } from './line-sim-parse';
import { SimSlipReader } from './sim-slip-reader';

const LINK_TTL_MS = 30 * 60 * 1000;
const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

type Staff = { id: string; name: string; role: string; tenantId: string | null; branchId: string | null };

/**
 * Staff report SIM / package sales by LINE: they link their LINE once, then send "dtac 250" (or a
 * screenshot of the carrier app) to FixITPro's LINE account. The sale is recorded as theirs, the
 * carrier wallet is charged, and the reply says what is left. When they also send what the carrier
 * app shows ("เหลือ 1200") and it differs, the owners are told right away.
 */
@Injectable()
export class LineSimService {
  private readonly logger = new Logger(LineSimService.name);
  private readonly reader = new SimSlipReader();

  constructor(
    private prisma: PrismaService,
    private line: LineMessagingService,
    private wallet: CarrierWalletService,
    private notif: NotificationsService,
  ) {}

  // ── Linking a LINE chat to a staff account ─────────────────────────────────

  private sign(payload: string): string {
    const secret = process.env.JWT_SECRET ?? '';
    return createHmac('sha256', `line-link:${secret}`).update(payload).digest('base64url').slice(0, 16);
  }

  /** A link code good for 30 minutes: "<userId>.<expiry>.<signature>". */
  linkCode(userId: string, now = Date.now()): string {
    const payload = `${userId}.${(now + LINK_TTL_MS).toString(36)}`;
    return `${payload}.${this.sign(payload)}`;
  }

  /** The user a link code was made for, or null when it is forged or expired. */
  userOfCode(code: string, now = Date.now()): string | null {
    const [userId, exp, sig] = code.split('.');
    if (!userId || !exp || !sig) return null;
    const want = Buffer.from(this.sign(`${userId}.${exp}`));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    if (parseInt(exp, 36) < now) return null;
    return userId;
  }

  /** What the "บันทึกผ่าน LINE" button needs: the chat link with the code typed in. */
  async linkInfo(userId: string) {
    const { oaId, ready } = centralLine();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { lineChatId: true } });
    const code = this.linkCode(userId);
    const id = oaId.startsWith('@') ? oaId : `@${oaId}`;
    return {
      ready,
      linked: !!user?.lineChatId,
      oaId: ready ? id : null,
      url: ready ? `https://line.me/R/oaMessage/${encodeURIComponent(id)}/?${encodeURIComponent(`${LINK_PREFIX} ${code}`)}` : null,
      readsImages: this.reader.enabled,
    };
  }

  async unlink(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { lineChatId: null } });
    return { linked: false };
  }

  private async link(lineUserId: string, code: string, replyToken?: string) {
    const userId = this.userOfCode(code);
    if (!userId) {
      await this.reply(replyToken, 'ลิงก์เชื่อมบัญชีหมดอายุหรือไม่ถูกต้อง กรุณากด "บันทึกผ่าน LINE" ในหน้าขายซิมอีกครั้ง');
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, isActive: true } });
    if (!user?.isActive) {
      await this.reply(replyToken, 'บัญชีพนักงานนี้ถูกปิดใช้งาน');
      return;
    }
    // One LINE per staff account and one staff account per LINE
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { lineChatId: lineUserId, NOT: { id: userId } }, data: { lineChatId: null } }),
      this.prisma.user.update({ where: { id: userId }, data: { lineChatId: lineUserId } }),
    ]);
    await this.reply(replyToken, `เชื่อม LINE กับบัญชี ${user.name} แล้ว ✅\n\n${HELP_TEXT}`);
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  private reply(replyToken: string | undefined, text: string, choices: { label: string; text: string }[] = []) {
    if (!replyToken) return Promise.resolve(false);
    return choices.length ? this.line.replyWithChoices(replyToken, text, choices) : this.line.replyMessage(replyToken, text);
  }

  private staffOf(lineUserId: string): Promise<Staff | null> {
    return this.prisma.user.findFirst({
      where: { lineChatId: lineUserId, isActive: true },
      select: { id: true, name: true, role: true, tenantId: true, branchId: true },
    });
  }

  /**
   * A text message. Returns false when it is not for this feature (not a link code and the sender
   * is not linked staff), so the other LINE handlers can look at it.
   */
  async handleText(lineUserId: string, text: string, replyToken: string | undefined, messageId: string): Promise<boolean> {
    const cmd = parseLineSim(text);
    if (cmd.kind === 'link') {
      await this.link(lineUserId, cmd.code, replyToken);
      return true;
    }
    const staff = await this.staffOf(lineUserId);
    if (!staff) return false;

    if (cmd.kind === 'help' || cmd.kind === 'unknown') {
      await this.reply(replyToken, cmd.kind === 'help' ? HELP_TEXT : `ไม่เข้าใจข้อความ\n\n${HELP_TEXT}`);
      return true;
    }
    if (cmd.kind === 'balance') {
      await this.reply(replyToken, await this.balancesText(staff.tenantId));
      return true;
    }
    await this.recordSale(staff, cmd, replyToken, messageId);
    return true;
  }

  /** A screenshot. Read with AI when the server has a key; otherwise ask for the text. */
  async handleImage(lineUserId: string, messageId: string, replyToken: string | undefined): Promise<boolean> {
    const staff = await this.staffOf(lineUserId);
    if (!staff) return false;
    if (!this.reader.enabled) {
      await this.reply(replyToken, 'ระบบยังอ่านรูปไม่ได้ กรุณาพิมพ์ค่ายกับราคาแทน เช่น  dtac 250 เหลือ 1200');
      return true;
    }
    const content = await this.line.fetchContent(messageId);
    const r = content ? await this.reader.read(content.data, content.contentType) : null;
    if (!r?.carrier || !r.amount) {
      await this.reply(replyToken, 'อ่านรูปไม่ออก กรุณาพิมพ์ค่ายกับราคาแทน เช่น  dtac 250 เหลือ 1200');
      return true;
    }
    // Nothing is recorded from a picture until the staff taps to confirm what was read
    const command = [r.carrier.toLowerCase(), r.amount, r.phone, r.balanceAfter != null ? `เหลือ ${r.balanceAfter}` : null]
      .filter((x) => x != null).join(' ');
    await this.reply(
      replyToken,
      `อ่านจากรูปได้:\n${r.carrier} ${baht(r.amount)} บาท${r.phone ? `\nเบอร์ ${r.phone}` : ''}${r.balanceAfter != null ? `\nแอปค่ายเหลือ ${baht(r.balanceAfter)}` : ''}\n\nกด "บันทึก" ถ้าถูกต้อง หรือพิมพ์ใหม่ถ้าผิด`,
      [{ label: 'บันทึก', text: command }, { label: 'ลูกค้าโอน', text: `${command} โอน` }],
    );
    return true;
  }

  private async canSell(staff: Staff): Promise<string | null> {
    if (staff.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: staff.tenantId }, select: { expiryDate: true, status: true } });
      const block = tenantWriteBlock(tenant);
      if (block) return TENANT_BLOCK_MESSAGE[block];
    }
    if (staff.role === 'OWNER' || staff.role === 'SUPER_ADMIN') return null;
    const [roleRows, userRows] = await Promise.all([
      loadRolePermissions(this.prisma, staff.role, staff.tenantId),
      this.prisma.userPermission.findMany({ where: { userId: staff.id }, select: { permission: true } }),
    ]);
    const held = new Set([...roleRows, ...userRows.map((r) => r.permission)]);
    return held.has('sales.create') ? null : 'บัญชีนี้ไม่มีสิทธิ์บันทึกการขาย';
  }

  private async recordSale(
    staff: Staff,
    cmd: Extract<ReturnType<typeof parseLineSim>, { kind: 'sale' }>,
    replyToken: string | undefined,
    messageId: string,
  ) {
    const blocked = await this.canSell(staff);
    if (blocked) {
      await this.reply(replyToken, `บันทึกไม่ได้: ${blocked}`);
      return;
    }
    // LINE re-sends a message when our answer is slow: never record the same message twice
    const tag = `LINE#${messageId}`;
    const already = await this.prisma.packageSale.findFirst({ where: { tenantId: staff.tenantId, note: { contains: tag } }, select: { receiptNumber: true } });
    if (already) {
      await this.reply(replyToken, `รายการนี้บันทึกไปแล้ว (${already.receiptNumber})`);
      return;
    }

    let sale: { receiptNumber: string; walletDeduction: number; walletBalance: number };
    try {
      sale = await this.wallet.createPackageSale({
        carrier: cmd.carrier as any,
        saleType: cmd.saleType as any,
        packageAmount: cmd.amount,
        ...(cmd.dealerCost != null ? { dealerCost: cmd.dealerCost } : {}),
        paymentMethod: cmd.paymentMethod,
        amountPaid: cmd.amount,
        cashierName: staff.name,
        ...(cmd.phone ? { phoneNumber: cmd.phone } : {}),
        note: `บันทึกผ่าน LINE ${tag}`,
      } as any, staff.id, staff.tenantId);
    } catch (err) {
      const msg = (err as { response?: { message?: string } }).response?.message ?? (err as Error).message;
      const short = /ไม่เพียงพอ/.test(String(msg));
      await this.reply(replyToken, `บันทึกไม่ได้: ${msg}${short ? '\n\nถ้าเพิ่งเติมเงินเข้ากระเป๋า ให้บันทึก "เติมเงินกระเป๋า" ในระบบก่อน ถ้าไม่ได้เติม แสดงว่ายอดในระบบน้อยกว่าจริง ให้เจ้าของร้านตรวจยอด' : ''}`);
      if (short) {
        await this.alertOwners(staff, `${staff.name} ขาย ${cmd.carrier} ${baht(cmd.amount)} ทาง LINE ไม่ได้ เพราะยอดกระเป๋าในระบบไม่พอ: ${msg}`, `${cmd.carrier}-short-${messageId}`);
      }
      return;
    }

    const lines = [
      `✅ บันทึกแล้ว ${cmd.carrier} ${baht(cmd.amount)} บาท${cmd.saleType === 'TOPUP' ? ' (เติมเงิน)' : ''}${cmd.paymentMethod === 'TRANSFER' ? ' · โอน' : ' · เงินสด'}`,
      cmd.phone ? `เบอร์ ${cmd.phone}` : null,
      `หักกระเป๋า ${baht(sale.walletDeduction)} · ระบบเหลือ ${baht(sale.walletBalance)}`,
    ];
    if (cmd.reportedBalance != null) {
      const diff = Math.round((cmd.reportedBalance - sale.walletBalance) * 100) / 100;
      if (Math.abs(diff) < 1) {
        lines.push('ตรงกับแอปค่าย 👍');
      } else {
        lines.push(`⚠️ แอปค่ายเหลือ ${baht(cmd.reportedBalance)} ${diff < 0 ? 'น้อยกว่า' : 'มากกว่า'}ระบบ ${baht(Math.abs(diff))} บาท แจ้งเจ้าของร้านแล้ว`);
        await this.alertOwners(
          staff,
          `${cmd.carrier}: แอปค่ายเหลือ ${baht(cmd.reportedBalance)} แต่ระบบเหลือ ${baht(sale.walletBalance)} (${diff < 0 ? 'ขาด' : 'เกิน'} ${baht(Math.abs(diff))} บาท) หลัง ${staff.name} ขาย ${baht(cmd.amount)} ทาง LINE · ${sale.receiptNumber}`,
          sale.receiptNumber,
        );
      }
    } else {
      lines.push('ใส่ยอดที่แอปค่ายโชว์ด้วย ระบบจะเทียบให้ เช่น  dtac 250 เหลือ 1200');
    }
    lines.push(sale.receiptNumber);
    await this.reply(replyToken, lines.filter(Boolean).join('\n'));
  }

  private async balancesText(tenantId: string | null): Promise<string> {
    const rows = (await this.wallet.getBalances(tenantId)) as { carrier: Carrier; balance: number }[];
    if (!rows.length) return 'ยังไม่มียอดกระเป๋าในระบบ';
    return ['ยอดกระเป๋าในระบบ', ...rows.map((r) => `${r.carrier}  ${baht(Number(r.balance))} บาท`)].join('\n');
  }

  /** In the app for the shop's owners and managers, and on LINE for those who linked it. */
  private async alertOwners(staff: Staff, message: string, entityId: string) {
    await this.notif.notify({
      type: 'SIM_WALLET_MISMATCH',
      title: 'ยอดกระเป๋าซิมไม่ตรง',
      message,
      severity: 'WARNING',
      entityType: 'PackageSale',
      entityId,
      tenantId: staff.tenantId,
    });
    const bosses = await this.prisma.user.findMany({
      where: { tenantId: staff.tenantId, isActive: true, role: { in: ['OWNER', 'MANAGER'] as any }, lineChatId: { not: null } },
      select: { lineChatId: true },
    });
    for (const b of bosses) {
      await this.line.pushCentral(b.lineChatId!, `⚠️ ${message}`).catch(() => false);
    }
  }
}
