'use client'

import { useEffect } from 'react'

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[StaffError]', error)
  }, [error])

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', background: '#fff', minHeight: '100vh' }}>
      <h2 style={{ color: '#ef4444', fontSize: 18, marginBottom: 8 }}>Staff Page Error</h2>
      <p style={{ color: '#111', fontWeight: 'bold', marginBottom: 4 }}>{error.message}</p>
      {error.digest && <p style={{ color: '#94a3b8', fontSize: 12 }}>Digest: {error.digest}</p>}
      <pre style={{ marginTop: 12, fontSize: 11, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f3f4f6', padding: 12, borderRadius: 8 }}>
        {error.stack}
      </pre>
      <button
        onClick={reset}
        style={{ marginTop: 16, padding: '8px 20px', background: '#FFC107', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
      >
        ลองใหม่
      </button>
    </div>
  )
}
