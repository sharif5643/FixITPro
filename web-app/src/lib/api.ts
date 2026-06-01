import axios, { AxiosRequestConfig } from 'axios'
import { useBranchStore } from '@/store/branch.store'

// Extend config type to allow retry tracking
interface RetryConfig extends AxiosRequestConfig {
  _retryCount?: number
}

// CHB-08: NEXT_PUBLIC_API_URL is substituted at build time by Next.js.
// If it is missing, every API call would silently fall back to localhost and
// fail in production. Throw immediately so the build fails loud and clear.
const _apiUrl = process.env.NEXT_PUBLIC_API_URL
if (!_apiUrl) {
  throw new Error(
    '[FixITPro] NEXT_PUBLIC_API_URL is not set. ' +
    'Add it to .env.production before running "next build".',
  )
}

const api = axios.create({
  baseURL: _apiUrl,
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
