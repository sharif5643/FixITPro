'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/api'
import type { Customer } from '@/types'

const customerSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อ'),
  phone: z.string().optional(),
  email: z.union([z.string().email('รูปแบบอีเมลไม่ถูกต้อง'), z.literal('')]).optional(),
  address: z.string().optional(),
  note: z.string().optional(),
})

type CustomerFormData = z.infer<typeof customerSchema>

interface CustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: Customer
  onSuccess: () => void
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  initialData,
  onSuccess,
}: CustomerFormDialogProps) {
  const isEdit = !!initialData

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
  })

  useEffect(() => {
    if (open) {
      reset({
        name: initialData?.name ?? '',
        phone: initialData?.phone ?? '',
        email: initialData?.email ?? '',
        address: initialData?.address ?? '',
        note: initialData?.note ?? '',
      })
    }
  }, [open, initialData, reset])

  const mutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const payload = {
        name: data.name.trim(),
        phone: data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
        address: data.address?.trim() || undefined,
        note: data.note?.trim() || undefined,
      }
      if (isEdit) {
        return (await api.put(`/customers/${initialData!.id}`, payload)).data
      }
      return (await api.post('/customers', payload)).data
    },
    onSuccess: () => {
      toast.success(isEdit ? 'แก้ไขข้อมูลสำเร็จ' : 'เพิ่มลูกค้าสำเร็จ')
      onSuccess()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((data) => mutation.mutateAsync(data))}
          className="space-y-4 pt-1"
        >
          <div className="space-y-1.5">
            <Label>
              ชื่อ <span className="text-red-500">*</span>
            </Label>
            <Input placeholder="ชื่อ-นามสกุล" {...register('name')} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>เบอร์โทร</Label>
              <Input placeholder="0XX-XXX-XXXX" {...register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label>อีเมล</Label>
              <Input type="email" placeholder="email@example.com" {...register('email')} />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ที่อยู่</Label>
            <Input placeholder="ที่อยู่" {...register('address')} />
          </div>

          <div className="space-y-1.5">
            <Label>หมายเหตุ</Label>
            <Input placeholder="บันทึกเพิ่มเติม..." {...register('note')} />
          </div>

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="min-w-[100px]">
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : isEdit ? (
                'บันทึก'
              ) : (
                'เพิ่มลูกค้า'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
