import {
  applyDecorators, BadRequestException, CallHandler, ConflictException, ExecutionContext, Injectable,
  Logger, NestInterceptor, UseInterceptors,
} from '@nestjs/common';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma.service';

const STALE_MS = 2 * 60_000;            // a claim this old with no answer: the request died
const KEEP_MS  = 3 * 24 * 3600_000;     // answers kept this long

/**
 * Money requests are recorded once per intent. The app sends an `Idempotency-Key` that stays the
 * same for one sale / payment / refund until it succeeds (a second tap after a lost answer, or an
 * offline item sent again, carries the same key). The first answer is stored; a repeat gets that
 * answer back instead of a second bill or payment. A repeat while the first is still running is
 * refused (409). A request that failed leaves no trace, so it can be sent again.
 * Requests without the header behave as before.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const raw = req.headers?.['idempotency-key'];
    const userId: string | undefined = req.user?.id;
    if (!raw || !userId) return next.handle();
    const key = String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw new BadRequestException('Idempotency-Key ไม่ถูกต้อง');
    const method = String(req.method ?? 'POST').toUpperCase();
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];

    return from(this.claim(userId, key, method, path)).pipe(
      mergeMap((prev) => {
        if (prev === 'NEW') {
          return next.handle().pipe(
            mergeMap((body) => from(this.finish(userId, key, res?.statusCode ?? 201, body)).pipe(mergeMap(() => of(body)))),
            catchError((err) => from(this.release(userId, key)).pipe(mergeMap(() => throwError(() => err)))),
          );
        }
        if (prev.path !== path || prev.method !== method) {
          throw new ConflictException('Idempotency-Key นี้ใช้กับรายการอื่นไปแล้ว');
        }
        if (prev.completedAt) {
          // the same intent again: the answer it got the first time, nothing recorded twice
          if (res?.status && prev.statusCode) res.status(prev.statusCode);
          if (res?.setHeader) res.setHeader('Idempotent-Replay', 'true');
          return of(prev.response);
        }
        throw new ConflictException('รายการนี้กำลังบันทึกอยู่ — รอสักครู่ แล้วดูประวัติก่อนกดใหม่');
      }),
    );
  }

  /** 'NEW' when this request is the first with the key; otherwise the earlier record */
  private async claim(userId: string, key: string, method: string, path: string) {
    if (Math.random() < 0.01) {
      this.prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } }).catch(() => undefined);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.prisma.idempotencyKey.create({ data: { userId, key, method, path } });
        return 'NEW' as const;
      } catch (e) {
        if ((e as { code?: string })?.code !== 'P2002') throw e;
      }
      const prev = await this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
      if (!prev) continue; // released in between: try to claim it again
      if (!prev.completedAt && Date.now() - prev.createdAt.getTime() > STALE_MS) {
        // the first attempt never answered (process restarted): let this one run
        await this.prisma.idempotencyKey.deleteMany({ where: { id: prev.id, completedAt: null } });
        continue;
      }
      return prev;
    }
    throw new ConflictException('รายการนี้กำลังบันทึกอยู่ — ลองใหม่อีกครั้ง');
  }

  private async finish(userId: string, key: string, statusCode: number, body: unknown) {
    try {
      const response = body === undefined ? null : JSON.parse(JSON.stringify(body));
      await this.prisma.idempotencyKey.update({
        where: { userId_key: { userId, key } },
        data:  { statusCode, response, completedAt: new Date() },
      });
    } catch (e) {
      // the request itself succeeded; only its replay is lost
      this.logger.warn(`could not store the answer for key ${key}: ${(e as Error).message}`);
    }
  }

  private async release(userId: string, key: string) {
    await this.prisma.idempotencyKey.deleteMany({ where: { userId, key, completedAt: null } }).catch(() => undefined);
  }
}

/** Mark a money route: a repeated Idempotency-Key gets the first answer, never a second record */
export const Idempotent = () => applyDecorators(UseInterceptors(IdempotencyInterceptor));
