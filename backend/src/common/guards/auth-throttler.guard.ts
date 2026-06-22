import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';

interface ThrottlerLimitDetail {
  totalHits: number;
  timeToExpire: number;
  limit: number;
  ttl: number;
  key: string;
  tracker: string;
}

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfter = throttlerLimitDetail.timeToExpire; // seconds
    // Set standard Retry-After header (ThrottlerGuard only sets Retry-After-<name>)
    context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: 'เข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่',
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
