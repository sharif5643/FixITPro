import { Controller, Post, Get, Body, UseGuards, Res } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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

  @Throttle({ auth_login: { ttl: 15 * 60 * 1000, limit: 5 } })
  @UseGuards(ThrottlerGuard)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    const cookieSecure  = process.env.COOKIE_SECURE === 'true';
    const cookieSameSite = (process.env.COOKIE_SAMESITE ?? 'lax') as 'strict' | 'lax' | 'none';
    // Express res.cookie() maxAge is in milliseconds; convert from seconds
    const maxAgeMs = parseExpiryToSeconds(process.env.JWT_EXPIRES_IN ?? '8h') * 1000;

    // CHB-01: set JWT as HttpOnly cookie — never returned in body
    res.cookie('access_token', result.accessToken, {
      httpOnly:  true,
      secure:    cookieSecure,
      sameSite:  cookieSameSite,
      path:      '/',
      maxAge:    maxAgeMs,
    });

    // Non-HttpOnly metadata cookies — readable by Next.js middleware for expiry redirect
    res.cookie('tenant_role', result.user.role, {
      httpOnly: false,
      secure:   cookieSecure,
      sameSite: cookieSameSite,
      path:     '/',
      maxAge:   maxAgeMs,
    });
    if (result.user.tenantExpiryDate) {
      const expMs = new Date(result.user.tenantExpiryDate).getTime();
      res.cookie('tenant_expiry_ts', String(expMs), {
        httpOnly: false,
        secure:   cookieSecure,
        sameSite: cookieSameSite,
        path:     '/',
        maxAge:   maxAgeMs,
      });
    } else {
      res.clearCookie('tenant_expiry_ts', { path: '/' });
    }

    // Strip accessToken from body — client reads cookie, not the token value
    const { accessToken: _omit, ...body } = result;
    return body;
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // CHB-01: server-side logout — clears all session cookies
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('tenant_role', { path: '/' });
    res.clearCookie('tenant_expiry_ts', { path: '/' });
    return { message: 'Logged out' };
  }

  @UseGuards(JwtAuthGuard)
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
