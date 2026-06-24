'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function StaffIndexPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/staff/home') }, [router])
  return null
}
