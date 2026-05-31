import axios, { AxiosRequestConfig } from 'axios'
import { useBranchStore } from '@/store/branch.store'

// Extend config type to allow retry tracking
interface RetryConfig extends AxiosRequestConfig {
  _retryCount?: number
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ── Request interceptor: attach token + branch ───────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('fixitpro-auth')
      if (stored) {
        const token = JSON.parse(stored)?.state?.accessToken
        if (token) config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // localStorage parse failure — continue without token
    }

    try {
      const branchId = useBranchStore.getState().selectedBranchId
      if (branchId) config.headers['X-Branch-Id'] = branchId
    } catch {
      // store read failure — continue without branch
    }
  }
  return config
})

// ── Response interceptor: retry + 401 redirect ───────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetryConfig
    const status: number | undefined = error.response?.status

    // 401 → force logout (except on auth endpoints)
    const isAuthEndpoint = (config?.url ?? '').includes('/auth/')
    if (status === 401 && typeof window !== 'undefined' && !isAuthEndpoint) {
      localStorage.removeItem('fixitpro-auth')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Retry on network errors or 5xx (max 2 retries, exponential backoff)
    const MAX_RETRIES = 2
    const isNetworkError = !error.response
    const isServerError  = status !== undefined && status >= 500

    if ((isNetworkError || isServerError) && config && !isAuthEndpoint) {
      config._retryCount = (config._retryCount ?? 0) + 1
      if (config._retryCount <= MAX_RETRIES) {
        const delay = Math.pow(2, config._retryCount) * 500 // 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, delay))
        return api(config)
      }
    }

    return Promise.reject(error)
  },
)

export default api
