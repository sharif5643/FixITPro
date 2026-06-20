import { Controller, Post, Get, Body, UseGuards, Res, Req, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_DAYS   = 30;

// CHB-01: convert JWT expiry string (e.g. "8h", "24h", "7d") to seconds for Max-Age
function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 8 * 3600;
  const value = parseInt(match[1], 10);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[match[2]] ?? 3600);
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string, role: string, tenantExpiryDate?: string | null) {
    const secure   = process.env.COOKIE_SECURE === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE ?? 'lax') as 'strict' | 'lax' | 'none';
    const accessMs  = parseExpiryToSeconds(process.env.JWT_EXPIRES_IN ?? '8h') * 1000;
    const refreshMs = REFRESH_DAYS * 86_400_000;

    res.cookie('access_token',   accessToken,   { httpOnly: true,  secure, sameSite, path: '/', maxAge: accessMs });
    res.cookie(REFRESH_COOKIE,   refreshToken,  { httpOnly: true,  secure, sameSite, path: '/api/v1/auth', maxAge: refreshMs });
    res.cookie('tenant_role',    role,          { httpOnly: false, secure, sameSite, path: '/', maxAge: accessMs });

    if (tenantExpiryDate) {
      const expMs = new Date(tenantExpiryDate).getTime();
      res.cookie('tenant_expiry_ts', String(expMs), { httpOnly: false, secure, sameSite, path: '/', maxAge: accessMs });
    } else {
      res.clearCookie('tenant_expiry_ts', { path: '/' });
    }
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth_login: { limit: 20, ttl: 15 * 60 * 1000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.user.role, result.user.tenantExpiryDate);

    const { accessToken: _a, refreshToken: _r, ...body } = result;
    return body;
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ auth_register: { limit: 3, ttl: 60 * 60 * 1000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException('No refresh token');

    const result = await this.authService.refresh(raw);

    const secure   = process.env.COOKIE_SECURE === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE ?? 'lax') as 'strict' | 'lax' | 'none';
    const accessMs  = parseExpiryToSeconds(process.env.JWT_EXPIRES_IN ?? '8h') * 1000;
    const refreshMs = REFRESH_DAYS * 86_400_000;

    res.cookie('access_token', result.accessToken, { httpOnly: true,  secure, sameSite, path: '/', maxAge: accessMs });
    res.cookie(REFRESH_COOKIE, result.refreshToken, { httpOnly: true, secure, sameSite, path: '/api/v1/auth', maxAge: refreshMs });

    return { ok: true };
  }

  // CHB-01: server-side logout — clears all session cookies and revokes refresh token
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      try { await this.authService.revokeRefreshToken(raw); } catch { /* best-effort */ }
    }
    res.clearCookie('access_token',    { path: '/' });
    res.clearCookie(REFRESH_COOKIE,    { path: '/api/v1/auth' });
    res.clearCookie('tenant_role',     { path: '/' });
    res.clearCookie('tenant_expiry_ts', { path: '/' });
    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ auth_change_pwd: { limit: 5, ttl: 15 * 60 * 1000 } })
  @Post('change-password')
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }
}
