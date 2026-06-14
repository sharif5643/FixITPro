import { ConflictException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import * as bcrypt from 'bcrypt'
import { AuditLogService } from '../audit-log/audit-log.service'
import { PrismaService } from '../database/prisma.service'
import { PublicRegisterService } from './public-register.service'

const mockPrisma = {
  user: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}

const mockAuditLog = {
  log: jest.fn().mockResolvedValue(undefined),
}

const validDto = {
  shopName: 'ร้านทดสอบ',
  ownerName: 'สมชาย ทดสอบ',
  phone: '0812345678',
  email: 'sa1122@fixitpro.com',
  password: 'password123',
  businessType: 'repair',
  themeColor: '#3B82F6',
  themePreset: 'blue',
}

describe('PublicRegisterService', () => {
  let service: PublicRegisterService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicRegisterService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
      ],
    }).compile()

    service = module.get<PublicRegisterService>(PublicRegisterService)
    jest.clearAllMocks()
  })

  it('should create tenant, user, branch and renewal in transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.tenant.findUnique.mockResolvedValue(null)

    const fakeTenant = { id: 'tenant-1', shopName: validDto.shopName, email: validDto.email }
    const fakeUser = { id: 'user-1', name: validDto.ownerName, email: validDto.email }

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        tenant: { create: jest.fn().mockResolvedValue(fakeTenant) },
        branch: { create: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
        user: { create: jest.fn().mockResolvedValue(fakeUser) },
        tenantRenewal: { create: jest.fn().mockResolvedValue({ id: 'renewal-1' }) },
      }
      return fn(tx)
    })

    const result = await service.register(validDto)

    expect(result.message).toContain('สมัครสำเร็จ')
    expect(result.email).toBe(validDto.email)
    expect(result.tenantId).toBe('tenant-1')
  })

  it('should hash the password with bcrypt before storing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.tenant.findUnique.mockResolvedValue(null)

    let capturedPassword = ''
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        tenant: { create: jest.fn().mockResolvedValue({ id: 't1', email: validDto.email, shopName: validDto.shopName }) },
        branch: { create: jest.fn().mockResolvedValue({ id: 'b1' }) },
        user: {
          create: jest.fn().mockImplementation(async ({ data }: { data: { password: string } }) => {
            capturedPassword = data.password
            return { id: 'u1', name: validDto.ownerName, email: validDto.email }
          }),
        },
        tenantRenewal: { create: jest.fn().mockResolvedValue({}) },
      }
      return fn(tx)
    })

    await service.register(validDto)

    expect(capturedPassword).not.toBe(validDto.password)
    const isValid = await bcrypt.compare(validDto.password, capturedPassword)
    expect(isValid).toBe(true)
  })

  it('should throw ConflictException when email already exists as a user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user', email: validDto.email })

    await expect(service.register(validDto)).rejects.toThrow(ConflictException)
    await expect(service.register(validDto)).rejects.toThrow('อีเมลนี้ถูกใช้งานแล้ว')
  })

  it('should throw ConflictException when email already exists as a tenant', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'existing-tenant', email: validDto.email })

    await expect(service.register(validDto)).rejects.toThrow(ConflictException)
    await expect(service.register(validDto)).rejects.toThrow('อีเมลนี้ถูกใช้งานแล้ว')
  })

  it('should reject duplicate email regardless of original casing (DTO @Transform normalises to lowercase before service)', async () => {
    // PublicRegisterDto has @Transform that converts value.trim().toLowerCase() on email.
    // By the time the service receives dto.email it is always lowercase.
    // This test simulates ABC@gmail.com arriving at the service already normalised.
    const normalisedDto = { ...validDto, email: 'abc@gmail.com' }
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-existing', email: 'abc@gmail.com' })

    await expect(service.register(normalisedDto)).rejects.toThrow(ConflictException)
    await expect(service.register(normalisedDto)).rejects.toThrow('อีเมลนี้ถูกใช้งานแล้ว')
    // confirm service called findUnique with the already-lowercased email
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'abc@gmail.com' } })
  })

  it('should set expiryDate 30 days from now and TRIAL plan', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.tenant.findUnique.mockResolvedValue(null)

    let capturedTenantData: any = null
    let capturedRenewalData: any = null

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        tenant: {
          create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
            capturedTenantData = data
            return { id: 't1', email: data.email, shopName: data.shopName }
          }),
        },
        branch: { create: jest.fn().mockResolvedValue({ id: 'b1' }) },
        user: { create: jest.fn().mockResolvedValue({ id: 'u1', name: validDto.ownerName, email: validDto.email }) },
        tenantRenewal: {
          create: jest.fn().mockImplementation(async ({ data }: { data: any }) => {
            capturedRenewalData = data
            return {}
          }),
        },
      }
      return fn(tx)
    })

    const before = new Date()
    await service.register(validDto)
    const after = new Date()

    expect(capturedTenantData.plan).toBe('TRIAL')
    expect(capturedTenantData.status).toBe('ACTIVE')
    expect(capturedRenewalData.action).toBe('TRIAL_STARTED')
    expect(capturedRenewalData.duration).toBe(30)

    const expiry: Date = capturedTenantData.expiryDate
    const diffDays = Math.round((expiry.getTime() - before.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBeGreaterThanOrEqual(29)
    expect(diffDays).toBeLessThanOrEqual(30)
  })
})
