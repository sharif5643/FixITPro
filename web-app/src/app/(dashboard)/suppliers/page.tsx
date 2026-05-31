'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Loader2, Building2, Phone,
  Mail, MapPin, CreditCard, Search, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import api from '@/lib/api'
import type { Supplier } from '@/types'

const supplierSchema = z.object({
  name: z.string().min(1, 'ต้องระบุชื่อซัพพลายเออร์'),
  phone: z.string().optional(),
  email: z.string().email('อีเมลไม่ถูกต้อง').optional().or(z.literal('')),
  address: z.string().optional(),
  taxId: z.string().optional(),
  creditDays: z.coerce.number().int().min(0).default(0),
  note: z.string().optional(),
})
type SupplierForm = z.infer<typeof supplierSchema>

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  true:  { label: 'ใช้งาน',   cls: 'bg-green-100 text-green-700 border-green-200' },
  false: { label: 'ปิดการใช้', cls: 'bg-gray-100  text-gray-600  border-gray-200'  },
}

export default function SuppliersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch]       = useState('')
  const [formOpen, setFormOpen]   = useState(false)
  const [editing, setEditing]     = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers', search],
    queryFn: async () =>
      (await api.get('/suppliers', { params: { search: search || undefined } })).data,
    staleTime: 30_000,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { creditDays: 0 },
  })

  const openCreate = () => {
    setEditing(null)
    reset({ name: '', phone: '', email: '', address: '', taxId: '', creditDays: 0, note: '' })
    setFormOpen(true)
  }

  const openEdit = (s: Supplier) => {
    setEditing(s)
    reset({
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      taxId: s.taxId ?? '',
      creditDays: s.creditDays,
      note: s.note ?? '',
    })
    setFormOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async (data: SupplierForm) => {
      const payload = { ...data, email: data.email || undefined }
      if (editing) {
        return (await api.patch(`/suppliers/${editing.id}`, payload)).data
      }
      return (await api.post('/suppliers', payload)).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setFormOpen(false)
      toast.success(editing ? 'แก้ไขซัพพลายเออร์แล้ว' : 'เพิ่มซัพพลายเออร์แล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      setDeleteTarget(null)
      toast.success('ปิดการใช้งานซัพพลายเออร์แล้ว')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'เกิดข้อผิดพลาด')
    },
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ซัพพลายเออร์</h1>
          <p className="text-sm text-muted-foreground mt-0.5">จัดการผู้จัดจำหน่ายสินค้า</p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">เพิ่มซัพพลายเออร์</span>
          <span className="sm:hidden">เพิ่ม</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ค้นหาซัพพลายเออร์..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">กำลังโหลด...</span>
            </div>
          ) : suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Building2 className="h-8 w-8 opacity-30" />
              <p className="text-sm">{search ? 'ไม่พบซัพพลายเออร์' : 'ยังไม่มีซัพพลายเออร์'}</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-4 py-3 font-medium">ชื่อ</th>
                      <th className="text-left px-4 py-3 font-medium">เบอร์โทร</th>
                      <th className="text-left px-4 py-3 font-medium">อีเมล</th>
                      <th className="text-center px-4 py-3 font-medium">เครดิต (วัน)</th>
                      <th className="text-center px-4 py-3 font-medium">สถานะ</th>
                      <th className="text-center px-4 py-3 font-medium">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => {
                      const status = STATUS_LABELS[String(s.isActive)]
                      return (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50/60">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{s.name}</p>
                            {s.taxId && (
                              <p className="text-xs text-muted-foreground">เลขผู้เสียภาษี: {s.taxId}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{s.phone ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-700">{s.email ?? '—'}</td>
                          <td className="px-4 py-3 text-center font-medium">{s.creditDays}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${status.cls}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Link href={`/suppliers/${s.id}/payables`}>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800" title="ดูบัญชีเจ้าหนี้">
                                  <FileText className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                onClick={() => openEdit(s)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {s.isActive && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                  onClick={() => setDeleteTarget(s)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y">
                {suppliers.map((s) => {
                  const status = STATUS_LABELS[String(s.isActive)]
                  return (
                    <div key={s.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{s.name}</p>
                          {s.taxId && <p className="text-xs text-muted-foreground">{s.taxId}</p>}
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-0.5">
                        {s.phone && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {s.phone}
                          </p>
                        )}
                        {s.email && (
                          <p className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            {s.email}
                          </p>
                        )}
                        <p className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                          เครดิต {s.creditDays} วัน
                        </p>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Link href={`/suppliers/${s.id}/payables`}>
                          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                            <FileText className="h-3 w-3" />
                            ดูบัญชี
                          </Button>
                        </Link>
                        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => openEdit(s)}>
                          <Pencil className="h-3 w-3" />
                          แก้ไข
                        </Button>
                        {s.isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 className="h-3 w-3" />
                            ปิดการใช้
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(v: boolean) => { if (!v) setFormOpen(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              {editing ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>ชื่อซัพพลายเออร์ <span className="text-red-500">*</span></Label>
              <Input placeholder="เช่น บริษัท ไทยโมบาย จำกัด" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  เบอร์โทร
                </Label>
                <Input placeholder="02-XXX-XXXX" {...register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  อีเมล
                </Label>
                <Input type="email" placeholder="supplier@email.com" {...register('email')} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                ที่อยู่
              </Label>
              <Textarea rows={2} placeholder="ที่อยู่บริษัท..." {...register('address')} className="text-sm resize-none" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>เลขผู้เสียภาษี</Label>
                <Input placeholder="0-0000-00000-00-0" {...register('taxId')} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  เงื่อนไขเครดิต (วัน)
                </Label>
                <Input type="number" min={0} step={1} placeholder="0" {...register('creditDays')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Textarea rows={2} placeholder="หมายเหตุเพิ่มเติม..." {...register('note')} className="text-sm resize-none" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} className="gap-2 min-w-[100px]">
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'บันทึกการแก้ไข' : 'เพิ่มซัพพลายเออร์'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v: boolean) => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดการใช้งานซัพพลายเออร์?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" จะถูกปิดการใช้งาน แต่ข้อมูลใน PO เดิมจะยังคงอยู่
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              ปิดการใช้งาน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
