'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, ChevronRight, Plus, Loader2, Wrench } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

interface Branch {
  id:      string
  name:    string
  address: string
  isActive: boolean
}

export default function SelectBranchPage() {
  const router = useRouter()
  const user   = useAuthStore((s) => s.user)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.get('/branches').then((r) => {
      setBranches(r.data?.data ?? r.data ?? [])
    }).catch(() => {
      // fallback — skip branch selection
      router.replace('/staff/home')
    }).finally(() => setLoading(false))
  }, [router])

  function selectBranch(branch: Branch) {
    localStorage.setItem('selectedBranchId',   branch.id)
    localStorage.setItem('selectedBranchName', branch.name)
    router.replace('/staff/home')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-light">
        <Loader2 className="h-8 w-8 animate-spin text-brand-yellow" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-brand-light">
      {/* Header */}
      <div className="bg-white px-6 pb-5 pt-14 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-yellow">
          <Wrench className="h-5 w-5 text-brand-black" strokeWidth={2.5} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-brand-black">เลือกสาขาที่ใช้งาน</h1>
        <p className="text-sm text-slate-500">สวัสดี {user?.name || 'พนักงาน'} เลือกสาขาที่คุณทำงาน</p>
      </div>

      {/* Branch list */}
      <div className="flex flex-col gap-3 p-5">
        {branches.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <MapPin className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-400">ยังไม่มีสาขา</p>
          </div>
        ) : (
          branches.map((b) => (
            <button
              key={b.id}
              onClick={() => selectBranch(b)}
              className="flex items-center gap-4 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-yellow/10">
                <MapPin className="h-7 w-7 text-brand-yellow" strokeWidth={2} />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-brand-black">{b.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{b.address}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  b.isActive ? 'bg-brand-success/10 text-brand-success' : 'bg-slate-100 text-slate-400'
                }`}>
                  {b.isActive ? 'เปิดทำการ' : 'ปิดทำการ'}
                </span>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </button>
          ))
        )}

        {(user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN') && (
          <button
            onClick={() => router.push('/branches')}
            className="flex items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-slate-200 py-5 text-sm font-medium text-slate-400 active:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            เพิ่มสาขาใหม่
          </button>
        )}
      </div>
    </div>
  )
}
