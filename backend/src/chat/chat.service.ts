import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // Same ownership rule as RepairsService.findOne: tenant users only reach repairs
  // whose branch belongs to their tenant.
  async canAccessRepair(repairId: string, tenantId: string | null | undefined): Promise<boolean> {
    if (!repairId) return false;
    const where: any = { id: repairId };
    if (tenantId) where.branch = { tenantId };
    const repair = await this.prisma.repair.findFirst({ where, select: { id: true } });
    return !!repair;
  }

  async assertRepairAccess(repairId: string, tenantId: string | null | undefined) {
    if (!(await this.canAccessRepair(repairId, tenantId))) {
      throw new NotFoundException('Repair not found');
    }
  }

  async getSocketUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, tenantId: true, isActive: true },
    });
  }

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
