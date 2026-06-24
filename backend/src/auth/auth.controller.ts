import { Controller, Post, Get, Body, UseGuards, Res, Req, UnauthorizedException, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthThrottlerGuard } from '../common/guards/auth-throttler.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

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

const STAFF_HOME = '/staff/home';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

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

  @UseGuards(AuthThrottlerGuard)
  @Throttle({ auth_login: { limit: 20, ttl: 60 * 1000 } })
  @SkipThrottle({ auth_register: true, auth_change_pwd: true })
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
  @SkipThrottle({ auth_login: true, auth_change_pwd: true })
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
  @SkipThrottle({ auth_login: true, auth_register: true })
  @Post('change-password')
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as any;
    if (!profile) return res.redirect('/staff/login?error=google_failed');

    const result = await this.authService.loginOrCreateSocialUser({
      provider:   'google',
      externalId: profile.googleId,
      email:      profile.email,
      name:       profile.name,
    });

    this.setAuthCookies(res, result.accessToken, result.refreshToken, result.user.role);
    return res.redirect(STAFF_HOME);
  }

  // ── LINE OAuth ───────────────────────────────────────────────────────────────

  @Get('line')
  lineAuth(@Res() res: Response) {
    const channelId  = this.config.get<string>('LINE_CHANNEL_ID');
    const callbackUrl = this.config.get<string>('LINE_CALLBACK_URL')
      ?? 'https://fixitpro.in.th/api/v1/auth/line/callback';
    const state = Math.random().toString(36).slice(2);

    if (!channelId) return res.redirect('/staff/login?error=line_not_configured');

    const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', channelId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'profile openid email');
    return res.redirect(url.toString());
  }

  @Get('line/callback')
  async lineCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) return res.redirect('/staff/login?error=line_failed');

    try {
      const channelId     = this.config.get<string>('LINE_CHANNEL_ID') ?? '';
      const channelSecret = this.config.get<string>('LINE_CHANNEL_SECRET') ?? '';
      const callbackUrl   = this.config.get<string>('LINE_CALLBACK_URL')
        ?? 'https://fixitpro.in.th/api/v1/auth/line/callback';

      // Exchange code for token
      const tokenRes = await axios.post(
        'https://api.line.me/oauth2/v2.1/token',
        new URLSearchParams({
          grant_type:    'authorization_code',
          code,
          redirect_uri:  callbackUrl,
          client_id:     channelId,
          client_secret: channelSecret,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const lineAccessToken: string = tokenRes.data.access_token;

      // Get user profile
      const profileRes = await axios.get('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${lineAccessToken}` },
      });
      const lineProfile = profileRes.data;

      // Try to get email from id_token if available
      let email = `line_${lineProfile.userId}@noemail.fixitpro`;
      if (tokenRes.data.id_token) {
        try {
          const payload = JSON.parse(
            Buffer.from(tokenRes.data.id_token.split('.')[1], 'base64').toString('utf8'),
          );
          if (payload.email) email = payload.email;
        } catch { /* ignore */ }
      }

      const result = await this.authService.loginOrCreateSocialUser({
        provider:   'line',
        externalId: lineProfile.userId,
        email,
        name:       lineProfile.displayName ?? email,
      });

      this.setAuthCookies(res, result.accessToken, result.refreshToken, result.user.role);
      return res.redirect(STAFF_HOME);
    } catch (err) {
      return res.redirect('/staff/login?error=line_failed');
    }
  }
}
