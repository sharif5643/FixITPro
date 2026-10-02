import { Controller, Get, Param, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('repairs/:repairId/messages')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get()
  async getMessages(
    @Param('repairId') repairId: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @Query('limit') limit?: string,
  ) {
    await this.chatService.assertRepairAccess(repairId, tenantId);
    return this.chatService.getMessages(repairId, limit ? parseInt(limit, 10) : 100);
  }
}
