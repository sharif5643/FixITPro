'use client'

import React from 'react'

interface State { hasError: boolean; error: Error | null }

// SUNMI-specific error boundary — dark theme, Thai text, no Shadcn deps.
// Renders a full-screen error page so white screens become diagnosable crashes.
export class SunmiErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SunmiErrorBoundary]', error.message, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg = this.state.error?.message ?? 'Unknown error'
    const stack = this.state.error?.stack?.slice(0, 300) ?? ''

    return (
      <div style={{
        minHeight: '100vh', background: '#0f172a', color: '#e2e8f0',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '24px', fontFamily: 'monospace',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
        <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f87171', marginBottom: '12px' }}>
          แอปเกิดข้อผิดพลาด
        </div>
        <div style={{
          background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
          padding: '16px', maxWidth: '380px', width: '100%', textAlign: 'left',
          marginBottom: '20px', wordBreak: 'break-all',
        }}>
          <div style={{ color: '#fbbf24', fontSize: '14px', marginBottom: '8px' }}>Error:</div>
          <div style={{ color: '#e2e8f0', fontSize: '13px' }}>{msg}</div>
          {stack && (
            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '8px', whiteSpace: 'pre-wrap' }}>
              {stack}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={btnStyle('#3b82f6')}
          >
            ลองใหม่
          </button>
          <button
            onClick={() => window.location.reload()}
            style={btnStyle('#16a34a')}
          >
            Reload
          </button>
          <button
            onClick={() => {
              try { localStorage.clear() } catch {}
              window.location.href = '/sunmi-health'
            }}
            style={btnStyle('#dc2626')}
          >
            ล้าง Cache
          </button>
        </div>

        <div style={{ marginTop: '20px', fontSize: '12px', color: '#475569' }}>
          /sunmi-health สำหรับวินิจฉัยเพิ่มเติม
        </div>
      </div>
    )
  }
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', border: 'none', borderRadius: '8px',
    padding: '12px 24px', fontSize: '16px', cursor: 'pointer',
  }
}
