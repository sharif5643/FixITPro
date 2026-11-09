/**
 * The API client retries a failed read, never a write: a POST that timed out or got a 5xx may
 * already be saved (the reply was lost), and sending it again made a second sale or payment.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import api from '@/lib/api'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'

function failingAdapter(status: number | null) {
  const calls: string[] = []
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    calls.push(`${config.method?.toUpperCase()} ${config.url}`)
    const err: any = new Error(status ? `HTTP ${status}` : 'Network Error')
    err.config = config
    err.isAxiosError = true
    if (status) err.response = { status, data: {}, headers: {}, config, statusText: '' }
    throw err
  }
  return { adapter, calls }
}

describe('API client retries', () => {
  const original = api.defaults.adapter
  afterEach(() => { api.defaults.adapter = original; vi.useRealTimers() })

  it('a POST that gets a 5xx is sent once', async () => {
    const { adapter, calls } = failingAdapter(502)
    api.defaults.adapter = adapter
    await expect(api.post('/sales', { items: [] })).rejects.toBeTruthy()
    expect(calls).toEqual(['POST /sales'])
  })

  it('a POST that loses its reply (network error) is sent once', async () => {
    const { adapter, calls } = failingAdapter(null)
    api.defaults.adapter = adapter
    await expect(api.post('/repairs/x/payment', {})).rejects.toBeTruthy()
    expect(calls).toHaveLength(1)
  })

  it('PATCH and DELETE are not retried either', async () => {
    const { adapter, calls } = failingAdapter(500)
    api.defaults.adapter = adapter
    await expect(api.patch('/repairs/x', {})).rejects.toBeTruthy()
    await expect(api.delete('/expenses/x')).rejects.toBeTruthy()
    expect(calls).toEqual(['PATCH /repairs/x', 'DELETE /expenses/x'])
  })

  it('a GET is still retried (up to 2 more times)', async () => {
    vi.useFakeTimers()
    const { adapter, calls } = failingAdapter(503)
    api.defaults.adapter = adapter
    const p = api.get('/products').catch((e) => e)
    await vi.runAllTimersAsync()
    await p
    expect(calls).toHaveLength(3)
  })
})
