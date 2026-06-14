import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { PublicRegisterDto } from './dto/public-register.dto'
import { PublicRegisterService } from './public-register.service'

@Controller('public')
export class PublicRegisterController {
  constructor(private readonly publicRegisterService: PublicRegisterService) {}

  @Throttle({ auth_register: { ttl: 60 * 60 * 1000, limit: 3 } })
  @UseGuards(ThrottlerGuard)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: PublicRegisterDto, @Req() req: Request) {
    return this.publicRegisterService.register(dto, req)
  }
}
