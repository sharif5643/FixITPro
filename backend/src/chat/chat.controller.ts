import { Controller, Get, Param, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';

@Controller('repairs/:repairId/messages')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get()
  async getMessages(
    @Param('repairId') repairId: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(repairId, limit ? parseInt(limit, 10) : 100);
  }
}
