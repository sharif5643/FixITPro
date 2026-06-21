import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PublicTrackingService {
  constructor(private prisma: PrismaService) {}

  async trackRepair(ticketNumber: string, phone: string) {
    if (!ticketNumber?.trim()) throw new BadRequestException('กรุณาระบุหมายเลขงานซ่อม');
    if (!phone?.trim()) throw new BadRequestException('กรุณาระบุหมายเลขโทรศัพท์');

    const repair = await this.prisma.repair.findUnique({
      where: { ticketNumber: ticketNumber.trim().toUpperCase() },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        deviceBrand: true,
        deviceModel: true,
        deviceColor: true,
        receivedAt: true,
        dueDate: true,
        completedAt: true,
        deliveredAt: true,
        warrantyExpiresAt: true,
        warrantyNote: true,
        paymentStatus: true,
        finalCost: true,
        estimatedTotal: true,
        estimateCost: true,
        deposit: true,
        paidAmount: true,
        customer: {
          select: { id: true, name: true, phone: true },
        },
        images: {
          orderBy: { createdAt: 'asc' as const },
          select: { id: true, url: true, createdAt: true },
        },
        qc: {
          select: {
            allPassed: true,
            createdAt: true,
          },
        },
        warranties: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            warrantyNumber: true,
            status: true,
            startDate: true,
            endDate: true,
            description: true,
          },
        },
      },
    });

    if (!repair) throw new NotFoundException('ไม่พบงานซ่อม กรุณาตรวจสอบหมายเลขงานซ่อม');

    // Phone verification — last 9 digits match
    const customerPhone = repair.customer?.phone?.replace(/\D/g, '') ?? '';
    const inputPhone = phone.replace(/\D/g, '');
    const digits = Math.min(customerPhone.length, inputPhone.length, 9);
    const phoneOk =
      digits > 0 &&
      customerPhone.slice(-digits) === inputPhone.slice(-digits);

    if (!phoneOk) {
      throw new BadRequestException('หมายเลขโทรศัพท์ไม่ตรงกับข้อมูลในระบบ');
    }

    // Calculate outstanding amount
    const total = Number(repair.finalCost ?? repair.estimatedTotal ?? repair.estimateCost ?? 0);
    const deposit = Number(repair.deposit ?? 0);
    const paid = Number(repair.paidAmount ?? 0);
    const outstanding = Math.max(0, total - deposit - paid);

    return {
      ticketNumber: repair.ticketNumber,
      status: repair.status,
      deviceBrand: repair.deviceBrand,
      deviceModel: repair.deviceModel,
      deviceColor: repair.deviceColor,
      receivedAt: repair.receivedAt,
      dueDate: repair.dueDate,
      completedAt: repair.completedAt,
      deliveredAt: repair.deliveredAt,
      customerName: repair.customer?.name,
      images: repair.images,
      qcPassed: repair.qc?.allPassed ?? null,
      qcAt: repair.qc?.createdAt ?? null,
      outstanding,
      paymentStatus: repair.paymentStatus,
      warranties: repair.warranties,
      warrantyExpiresAt: repair.warrantyExpiresAt,
      warrantyNote: repair.warrantyNote,
    };
  }
}
