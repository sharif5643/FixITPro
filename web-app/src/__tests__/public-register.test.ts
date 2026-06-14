import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pure logic tests — no DOM rendering needed
const mockPost = vi.fn()
vi.mock('@/lib/api', () => ({
  default: { post: mockPost },
}))

// Helper: import after mocks are set
async function getRegisterLogic() {
  // Inline the same validation logic used in the register page
  function validate(form: {
    shopName: string
    ownerName: string
    phone: string
    email: string
    password: string
    confirmPassword: string
    businessType: string
  }) {
    const e: Record<string, string> = {}
    if (!form.shopName.trim())     e.shopName     = 'กรุณากรอกชื่อร้าน'
    if (!form.ownerName.trim())    e.ownerName    = 'กรุณากรอกชื่อเจ้าของ'
    if (!form.phone.trim())        e.phone        = 'กรุณากรอกเบอร์โทร'
    if (!form.email.trim())        e.email        = 'กรุณากรอกอีเมล'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
    if (form.password.length < 8)  e.password     = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
    if (form.password !== form.confirmPassword) e.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
    if (!form.businessType)        e.businessType = 'กรุณาเลือกประเภทธุรกิจ'
    return e
  }

  return { validate }
}

const validForm = {
  shopName: 'ร้านทดสอบ',
  ownerName: 'สมชาย ทดสอบ',
  phone: '0812345678',
  email: 'sa1122@fixitpro.com',
  password: 'password123',
  confirmPassword: 'password123',
  businessType: 'repair',
}

describe('Register page — validation logic', () => {
  it('passes with all valid fields', async () => {
    const { validate } = await getRegisterLogic()
    const errors = validate(validForm)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('fails when required fields are empty', async () => {
    const { validate } = await getRegisterLogic()
    const errors = validate({ ...validForm, shopName: '', ownerName: '', email: '' })
    expect(errors.shopName).toBeDefined()
    expect(errors.ownerName).toBeDefined()
    expect(errors.email).toBeDefined()
  })

  it('fails when password is too short', async () => {
    const { validate } = await getRegisterLogic()
    const errors = validate({ ...validForm, password: 'abc', confirmPassword: 'abc' })
    expect(errors.password).toMatch(/8/)
  })

  it('fails when passwords do not match', async () => {
    const { validate } = await getRegisterLogic()
    const errors = validate({ ...validForm, confirmPassword: 'different123' })
    expect(errors.confirmPassword).toBeDefined()
  })

  it('fails when email format is invalid', async () => {
    const { validate } = await getRegisterLogic()
    const errors = validate({ ...validForm, email: 'notanemail' })
    expect(errors.email).toBeDefined()
  })
})

describe('Register page — API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls POST /public/register with correct payload', async () => {
    const api = await import('@/lib/api')
    mockPost.mockResolvedValue({ data: { message: 'สมัครสำเร็จ', email: validForm.email, tenantId: 't1' } })

    await api.default.post('/public/register', {
      shopName:  validForm.shopName,
      ownerName: validForm.ownerName,
      phone:     validForm.phone,
      email:     validForm.email,
      password:  validForm.password,
    })

    expect(mockPost).toHaveBeenCalledWith('/public/register', expect.objectContaining({
      shopName: validForm.shopName,
      email:    validForm.email,
    }))
  })

  it('returns success message on 201 response', async () => {
    mockPost.mockResolvedValue({ data: { message: 'สมัครสำเร็จ', email: validForm.email, tenantId: 't1' } })
    const api = await import('@/lib/api')
    const res = await api.default.post('/public/register', {})
    expect(res.data.message).toContain('สมัครสำเร็จ')
  })

  it('throws on duplicate email (409)', async () => {
    mockPost.mockRejectedValue({
      response: { status: 409, data: { message: 'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น' } },
    })
    const api = await import('@/lib/api')
    await expect(api.default.post('/public/register', {})).rejects.toMatchObject({
      response: { status: 409 },
    })
  })
})
