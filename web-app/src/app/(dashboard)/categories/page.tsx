'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Tag, Loader2, Layers, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface Category {
  id: string
  name: string
  slug: string
  categoryTypeId?: string
  _count: { products: number }
}

interface CategoryType {
  id: string
  name: string
  slug: string
  categories: Category[]
  _count: { categories: number }
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const typeSchema = z.object({ name: z.string().min(1, 'กรุณากรอกชื่อประเภท') })
type TypeFormData = z.infer<typeof typeSchema>

const categorySchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อหมวดหมู่'),
  categoryTypeId: z.string().min(1, 'กรุณาเลือกประเภท'),
})
type CategoryFormData = z.infer<typeof categorySchema>

// ── TypeFormDialog ────────────────────────────────────────────────────────────

function TypeFormDialog({
  open, onOpenChange, editing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: CategoryType | null
}) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<TypeFormData>({
    resolver: zodResolver(typeSchema),
    values: { name: editing?.name ?? '' },
  })

  const mutation = useMutation({
    mutationFn: (data: TypeFormData) =>
      editing
        ? api.put(`/categories/types/${editing.id}`, data)
        : api.post('/categories/types', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-types'] })
      toast.success(editing ? 'แก้ไขประเภทแล้ว' : 'เพิ่มประเภทแล้ว')
      onOpenChange(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? 'แก้ไขประเภท' : 'เพิ่มประเภทใหม่'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>ชื่อประเภท <span className="text-red-500">*</span></Label>
            <Input placeholder="เช่น มือถือ, อะไหล่, อุปกรณ์เสริม..." autoFocus {...register('name')}
              className={errors.name ? 'border-red-400' : ''} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="min-w-[100px]">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'บันทึก' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── CategoryFormDialog ────────────────────────────────────────────────────────

function CategoryFormDialog({
  open, onOpenChange, editing, types, defaultTypeId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: (Category & { categoryTypeId: string }) | null
  types: CategoryType[]
  defaultTypeId?: string
}) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    values: {
      name: editing?.name ?? '',
      categoryTypeId: editing?.categoryTypeId ?? defaultTypeId ?? '',
    },
  })

  const selectedTypeId = watch('categoryTypeId')

  const mutation = useMutation({
    mutationFn: (data: CategoryFormData) =>
      editing
        ? api.put(`/categories/${editing.id}`, data)
        : api.post('/categories', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-types'] })
      toast.success(editing ? 'แก้ไขหมวดหมู่แล้ว' : 'เพิ่มหมวดหมู่แล้ว')
      onOpenChange(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>ประเภท <span className="text-red-500">*</span></Label>
            <Select value={selectedTypeId} onValueChange={(v) => setValue('categoryTypeId', v)}>
              <SelectTrigger className={errors.categoryTypeId ? 'border-red-400' : ''}>
                <SelectValue placeholder="เลือกประเภท..." />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryTypeId && <p className="text-xs text-red-500">{errors.categoryTypeId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>ชื่อหมวดหมู่ <span className="text-red-500">*</span></Label>
            <Input placeholder="เช่น มือถือใหม่, อะไหล่จอ..." autoFocus {...register('name')}
              className={errors.name ? 'border-red-400' : ''} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="min-w-[100px]">
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'บันทึก' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── TypeSection ───────────────────────────────────────────────────────────────

function TypeSection({
  type, types, onEditType, onDeleteType, onAddCategory, onEditCategory, onDeleteCategory,
}: {
  type: CategoryType
  types: CategoryType[]
  onEditType: (t: CategoryType) => void
  onDeleteType: (t: CategoryType) => void
  onAddCategory: (typeId: string) => void
  onEditCategory: (c: Category & { categoryTypeId: string }) => void
  onDeleteCategory: (c: Category) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Type header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
            : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-4 w-4 text-blue-600 shrink-0" />
            <span className="font-semibold text-gray-900 truncate">{type.name}</span>
            <span className="text-xs text-muted-foreground bg-slate-200 rounded-full px-2 py-0.5 shrink-0">
              {type._count.categories} หมวดหมู่
            </span>
          </div>
        </button>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={() => onAddCategory(type.id)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            เพิ่มหมวดหมู่
          </button>
          <button
            onClick={() => onEditType(type)}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDeleteType(type)}
            disabled={type._count.categories > 0}
            title={type._count.categories > 0 ? 'มีหมวดหมู่อยู่ในประเภทนี้' : 'ลบ'}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Categories grid */}
      {!collapsed && (
        <div className="p-4">
          {type.categories.length === 0 ? (
            <button
              onClick={() => onAddCategory(type.id)}
              className="w-full flex flex-col items-center justify-center py-6 gap-2 rounded-lg border border-dashed text-muted-foreground hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              <Tag className="h-7 w-7 text-gray-300" />
              <p className="text-sm">ยังไม่มีหมวดหมู่ — คลิกเพื่อเพิ่ม</p>
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {type.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-lg border bg-gray-50/60 px-3 py-2.5 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 shrink-0">
                      <Tag className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">{cat._count.products} สินค้า</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 ml-2">
                    <button
                      onClick={() => onEditCategory({ ...cat, categoryTypeId: type.id })}
                      className="rounded-md p-1 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteCategory(cat)}
                      disabled={cat._count.products > 0}
                      title={cat._count.products > 0 ? 'มีสินค้าอยู่ในหมวดหมู่นี้' : 'ลบ'}
                      className="rounded-md p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const queryClient = useQueryClient()

  const [typeFormOpen, setTypeFormOpen] = useState(false)
  const [editingType, setEditingType] = useState<CategoryType | null>(null)
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<CategoryType | null>(null)

  const [catFormOpen, setCatFormOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<(Category & { categoryTypeId: string }) | null>(null)
  const [defaultTypeId, setDefaultTypeId] = useState<string | undefined>()
  const [deleteCatTarget, setDeleteCatTarget] = useState<Category | null>(null)

  const { data: types = [], isLoading } = useQuery<CategoryType[]>({
    queryKey: ['category-types'],
    queryFn: async () => (await api.get('/categories/types')).data,
    staleTime: 30_000,
  })

  const totalCategories = types.reduce((s, t) => s + t._count.categories, 0)

  function openAddType() {
    setEditingType(null)
    setTypeFormOpen(true)
  }

  function openEditType(type: CategoryType) {
    setEditingType(type)
    setTypeFormOpen(true)
  }

  function openAddCategory(typeId: string) {
    setEditingCat(null)
    setDefaultTypeId(typeId)
    setCatFormOpen(true)
  }

  function openEditCategory(cat: Category & { categoryTypeId: string }) {
    setEditingCat(cat)
    setDefaultTypeId(undefined)
    setCatFormOpen(true)
  }

  const deleteTypeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-types'] })
      toast.success('ลบประเภทแล้ว')
      setDeleteTypeTarget(null)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-types'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('ลบหมวดหมู่แล้ว')
      setDeleteCatTarget(null)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title="หมวดหมู่สินค้า"
        icon={Layers}
        subtitle={`${types.length} ประเภท · ${totalCategories} หมวดหมู่`}
        primaryAction={
          <Button onClick={openAddType} className="gap-2">
            <Plus className="h-4 w-4" />
            เพิ่มประเภท
          </Button>
        }
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>กำลังโหลด...</span>
        </div>
      ) : types.length === 0 ? (
        <div className="rounded-xl border bg-gray-50">
          <EmptyState
            preset="default"
            icon={Layers}
            title="ยังไม่มีประเภทสินค้า"
            description="เริ่มต้นด้วยการเพิ่มประเภท เช่น “มือถือ”, “อะไหล่”"
            ctaLabel="เพิ่มประเภทแรก"
            onCta={openAddType}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {types.map((type) => (
            <TypeSection
              key={type.id}
              type={type}
              types={types}
              onEditType={openEditType}
              onDeleteType={setDeleteTypeTarget}
              onAddCategory={openAddCategory}
              onEditCategory={openEditCategory}
              onDeleteCategory={setDeleteCatTarget}
            />
          ))}
        </div>
      )}

      {/* ── Type form dialog ── */}
      <TypeFormDialog
        open={typeFormOpen}
        onOpenChange={setTypeFormOpen}
        editing={editingType}
      />

      {/* ── Category form dialog ── */}
      <CategoryFormDialog
        open={catFormOpen}
        onOpenChange={setCatFormOpen}
        editing={editingCat}
        types={types}
        defaultTypeId={defaultTypeId}
      />

      {/* ── Delete type confirm ── */}
      <Dialog open={!!deleteTypeTarget} onOpenChange={(v) => { if (!v) setDeleteTypeTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ยืนยันการลบประเภท</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-700 py-2">
            ต้องการลบประเภท <span className="font-semibold">&ldquo;{deleteTypeTarget?.name}&rdquo;</span> ใช่หรือไม่?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTypeTarget(null)} disabled={deleteTypeMutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={deleteTypeMutation.isPending}
              onClick={() => deleteTypeTarget && deleteTypeMutation.mutate(deleteTypeTarget.id)}
              className="min-w-[80px]"
            >
              {deleteTypeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ลบ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete category confirm ── */}
      <Dialog open={!!deleteCatTarget} onOpenChange={(v) => { if (!v) setDeleteCatTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ยืนยันการลบหมวดหมู่</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-700 py-2">
            ต้องการลบหมวดหมู่ <span className="font-semibold">&ldquo;{deleteCatTarget?.name}&rdquo;</span> ใช่หรือไม่?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCatTarget(null)} disabled={deleteCatMutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCatMutation.isPending}
              onClick={() => deleteCatTarget && deleteCatMutation.mutate(deleteCatTarget.id)}
              className="min-w-[80px]"
            >
              {deleteCatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ลบ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
