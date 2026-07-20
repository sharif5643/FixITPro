'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Loader2, Building2, Phone,
  Mail, MapPin, CreditCard, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import Link from 'next/link'
import api from '@/lib/api'
import type { Supplier } from '@/types'

const supplierSchema = z.object({
  name:        z.string().min(1, 'ต้องระบุชื่อซัพพลายเออร์'),
  phone:       z.string().optional(),
  email:       z.string().email('อีเมลไม่ถูกต้อง').optional().or(z.literal('')),
  address:     z.string().optional(),
  taxId:       z.string().optional(),
  creditDays:  z.coerce.number().int().min(0).default(0),
  note:        z.string().optional(),
})
type SupplierForm = z.infer<typeof supplierSchema>

export default function SuppliersPage() {
  const queryClient = useQueryClient()
  const [search, setSearch]             = useState('')
  const [formOpen, setFormOpen]         = useState(false)
  const [editing, setEditing]           = useState<Supplier | null>(null)
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
      name: s.name, phone: s.phone ?? '', email: s.email ?? '',
      address: s.address ?? '', taxId: s.taxId ?? '',
      creditDays: s.creditDays, note: s.note ?? '',
    })
    setFormOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async (data: SupplierForm) => {
      const payload = { ...data, email: data.email || undefined }
      if (editing) return (await api.patch(`/suppliers/${editing.id}`, payload)).data
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
      <PageHeader
        title="ซัพพลายเออร์"
        icon={Building2}
        subtitle="จัดการผู้จัดจำหน่ายสินค้า"
        primaryAction={
          <Button onClick={openCreate} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">เพิ่มซัพพลายเออร์</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาซัพพลายเออร์..."
      />

      {/* Desktop table */}
      <SectionCard noPadding className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>ชื่อ</DataTableHeadCell>
            <DataTableHeadCell hidden>เบอร์โทร</DataTableHeadCell>
            <DataTableHeadCell hidden>อีเมล</DataTableHeadCell>
            <DataTableHeadCell className="text-center">เครดิต (วัน)</DataTableHeadCell>
            <DataTableHeadCell className="text-center">สถานะ</DataTableHeadCell>
            <DataTableHeadCell className="text-center w-28">จัดการ</DataTableHeadCell>
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={5} cols={6} />
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-0">
                  <EmptyState preset={search ? 'search' : 'default'} size="md" title={search ? 'ไม่พบซัพพลายเออร์' : 'ยังไม่มีซัพพลายเออร์'} />
                </td>
              </tr>
            ) : (
              suppliers.map((s) => (
                <DataTableRow key={s.id}>
                  <DataTableCell>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    {s.taxId && (
                      <p className="text-xs text-slate-400 mt-0.5">เลขผู้เสียภาษี: {s.taxId}</p>
                    )}
                  </DataTableCell>
                  <DataTableCell hidden muted>{s.phone ?? '—'}</DataTableCell>
                  <DataTableCell hidden muted>{s.email ?? '—'}</DataTableCell>
                  <DataTableCell className="text-center font-medium">{s.creditDays}</DataTableCell>
                  <DataTableCell className="text-center">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      s.isActive
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60'
                    }`}>
                      {s.isActive ? 'ใช้งาน' : 'ปิดการใช้'}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Link href={`/suppliers/${s.id}/payables`}>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50" title="ดูบัญชีเจ้าหนี้">
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-slate-100" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {s.isActive && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(s)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <SectionCard><div className="h-32 flex items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div></SectionCard>
        ) : suppliers.length === 0 ? (
          <SectionCard noPadding><EmptyState preset="default" size="md" title={search ? 'ไม่พบซัพพลายเออร์' : 'ยังไม่มีซัพพลายเออร์'} /></SectionCard>
        ) : (
          suppliers.map((s) => (
            <div key={s.id} className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{s.name}</p>
                  {s.taxId && <p className="text-xs text-slate-400 dark:text-slate-500">{s.taxId}</p>}
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${
                  s.isActive
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60'
                }`}>
                  {s.isActive ? 'ใช้งาน' : 'ปิดการใช้'}
                </span>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 space-y-0.5">
                {s.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{s.phone}</p>}
                {s.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{s.email}</p>}
                <p className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" />เครดิต {s.creditDays} วัน</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/suppliers/${s.id}/payables`} className="flex-1">
                  <Button size="sm" variant="outline" className="w-full gap-1.5 h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                    <FileText className="h-3 w-3" />ดูบัญชี
                  </Button>
                </Link>
                <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs" onClick={() => openEdit(s)}>
                  <Pencil className="h-3 w-3" />แก้ไข
                </Button>
                {s.isActive && (
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8 text-xs text-red-500 border-red-200 hover:bg-red-50" onClick={() => setDeleteTarget(s)}>
                    <Trash2 className="h-3 w-3" />ปิดการใช้
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(v) => { if (!v) setFormOpen(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-600" />
              {editing ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>ชื่อซัพพลายเออร์ <span className="text-red-500">*</span></Label>
              <Input placeholder="เช่น บริษัท ไทยโมบาย จำกัด" {...register('name')} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />เบอร์โทร</Label>
                <Input placeholder="02-XXX-XXXX" {...register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />อีเมล</Label>
                <Input type="email" placeholder="supplier@email.com" {...register('email')} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />ที่อยู่</Label>
              <Textarea rows={2} placeholder="ที่อยู่บริษัท..." {...register('address')} className="text-sm resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>เลขผู้เสียภาษี</Label>
                <Input placeholder="0-0000-00000-00-0" {...register('taxId')} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" />เงื่อนไขเครดิต (วัน)</Label>
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
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดการใช้งานซัพพลายเออร์?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; จะถูกปิดการใช้งาน แต่ข้อมูลใน PO เดิมจะยังคงอยู่
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
