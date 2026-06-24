import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getMessages(repairId: string, limit = 100) {
    return this.prisma.repairMessage.findMany({
      where: { repairId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async saveMessage(repairId: string, senderId: string, content: string) {
    return this.prisma.repairMessage.create({
      data: { repairId, senderId, content },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });
  }
}
