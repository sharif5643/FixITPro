import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface GoogleProfile {
  googleId:  string;
  email:     string;
  name:      string;
  picture?:  string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(private config: ConfigService) {
    super({
      clientID:     config.get<string>('GOOGLE_CLIENT_ID') ?? 'NOT_CONFIGURED',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') ?? 'NOT_CONFIGURED',
      callbackURL:  config.get<string>('GOOGLE_CALLBACK_URL') ?? 'https://fixitpro.in.th/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('No email from Google'), undefined);
    }
    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email,
      name: profile.displayName ?? email,
      picture: profile.photos?.[0]?.value,
    };
    this.logger.debug(`Google OAuth: ${email}`);
    done(null, googleProfile);
  }
}
