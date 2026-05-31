'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="th">
      <body style={{ fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0, background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1 style={{ fontSize: 48, color: '#ef4444', margin: 0 }}>500</h1>
          <h2 style={{ color: '#1e293b', marginTop: 8 }}>เกิดข้อผิดพลาดในระบบ</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            ระบบเกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง
          </p>
          {error.digest && (
            <p style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: '8px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  )
}
