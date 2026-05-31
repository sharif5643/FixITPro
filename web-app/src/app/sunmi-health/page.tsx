'use client'

import { useEffect, useState } from 'react'

// Bare-bones diagnostic page — no auth, no providers, no offline queue.
// Load http://192.168.1.172:3001/sunmi-health in the SUNMI browser to verify
// that the Next.js server is reachable and the WebView can execute JS.
export default function SunmiHealthPage() {
  const [idbStatus, setIdbStatus]     = useState('checking…')
  const [platform,  setPlatform]      = useState('unknown')
  const [apiUrl,    setApiUrl]        = useState('')
  const [online,    setOnline]        = useState(true)
  const [time,      setTime]          = useState('')

  useEffect(() => {
    setTime(new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }))
    setApiUrl(process.env.NEXT_PUBLIC_API_URL ?? 'not set')
    setOnline(navigator.onLine)

    // Detect Capacitor platform
    try {
      const { Capacitor } = require('@capacitor/core')
      setPlatform(Capacitor.getPlatform())
    } catch {
      setPlatform('web (Capacitor N/A)')
    }

    // Test IndexedDB availability
    if (typeof indexedDB === 'undefined') {
      setIdbStatus('UNAVAILABLE')
    } else {
      const req = indexedDB.open('__health_test__', 1)
      req.onsuccess  = () => { setIdbStatus('OK'); req.result.close() }
      req.onerror    = () => setIdbStatus('ERROR: ' + req.error?.message)
      req.onblocked  = () => setIdbStatus('BLOCKED')
    }
  }, [])

  return (
    <div style={{
      padding: '24px', fontFamily: 'monospace', background: '#0f172a',
      color: '#e2e8f0', minHeight: '100vh', fontSize: '16px', lineHeight: '1.8',
    }}>
      <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: 'bold', marginBottom: '20px' }}>
        ✓ SUNMI HEALTH OK
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        <Row label="Platform"  value={platform} />
        <Row label="API URL"   value={apiUrl} />
        <Row label="IndexedDB" value={idbStatus} ok={idbStatus === 'OK'} />
        <Row label="Online"    value={online ? 'YES' : 'NO'} ok={online} />
        <Row label="Time"      value={time} />
        <Row label="UA"        value={typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : '-'} />
      </div>

      <div style={{ marginTop: '32px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={() => window.location.reload()}
          style={btnStyle('#3b82f6')}
        >
          Reload
        </button>
        <button
          onClick={() => window.location.href = '/sunmi'}
          style={btnStyle('#16a34a')}
        >
          Go to /sunmi
        </button>
        <button
          onClick={() => window.location.href = '/login'}
          style={btnStyle('#7c3aed')}
        >
          Go to Login
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const color = ok === undefined ? '#e2e8f0' : ok ? '#22c55e' : '#f87171'
  return (
    <div>
      <span style={{ color: '#94a3b8', width: '100px', display: 'inline-block' }}>{label}:</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: '8px',
    padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
  }
}
