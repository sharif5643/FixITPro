import axios, { AxiosRequestConfig } from 'axios'
import { useBranchStore } from '@/store/branch.store'
import { useAuthStore } from '@/store/auth.store'

interface RetryConfig extends AxiosRequestConfig {
  _retryCount?: number
}

// CHB-08: NEXT_PUBLIC_API_URL is substituted at build time by Next.js.
const _apiUrl = process.env.NEXT_PUBLIC_API_URL
if (!_apiUrl) {
  console.error(
    '[FixITPro] NEXT_PUBLIC_API_URL is not set. ' +
    'Set it in Coolify Build Variables or .env.production before running "next build".',
  )
}

const api = axios.create({
  baseURL: _apiUrl,
  headers: { 'Content-Type': 'application/json' },
  // CHB-01: send HttpOnly cookie on every cross-origin request
  withCredentials: true,
  timeout: 30_000,
})

// ── Request interceptor: branch header only ───────────────
// CHB-01: Bearer token interceptor removed — cookie is sent automatically
api.interceptors.request.use((config) => {
  try {
    const branchId = useBranchStore.getState().selectedBranchId
    if (branchId) config.headers['X-Branch-Id'] = branchId
  } catch {
    // store read failure — continue without branch
  }
  return config
})

// ── Response interceptor: silent refresh → retry → 401 redirect ─────────────
// Guard prevents multiple concurrent 401s from triggering multiple refreshes
let _refreshing: Promise<boolean> | null = null
let _redirectingToLogin = false

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetryConfig
    const status: number | undefined = error.response?.status

    const isLoginOrRegister = /\/auth\/(login|register)/.test(config?.url ?? '')
    const isLogout          = /\/auth\/logout/.test(config?.url ?? '')
    const isRefresh         = /\/auth\/refresh/.test(config?.url ?? '')

    if (status === 401 && typeof window !== 'undefined' && !isLoginOrRegister && !isLogout && !isRefresh) {
      // Try silent refresh once before giving up
      if (!config._retryCount) {
        try {
          if (!_refreshing) {
            _refreshing = api.post('/auth/refresh').then(() => true).catch(() => false)
          }
          const refreshed = await _refreshing
          _refreshing = null

          if (refreshed) {
            config._retryCount = 1
            return api(config)
          }
        } catch {
          _refreshing = null
        }
      }

      // Refresh failed or already retried — send to login
      if (_redirectingToLogin) return Promise.reject(error)
      _redirectingToLogin = true
      useAuthStore.getState().clearAuth()
      try { await api.post('/auth/logout') } catch { /* best-effort */ }
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Retry on network errors or 5xx (max 2 retries, exponential backoff)
    const MAX_RETRIES = 2
    const isNetworkError = !error.response
    const isServerError  = status !== undefined && status >= 500

    const isAuthEndpoint = isLoginOrRegister || isLogout || isRefresh || /\/auth\//.test(config?.url ?? '')
    if ((isNetworkError || isServerError) && config && !isAuthEndpoint) {
      config._retryCount = (config._retryCount ?? 0) + 1
      if (config._retryCount <= MAX_RETRIES) {
        const delay = Math.pow(2, config._retryCount) * 500
        await new Promise((resolve) => setTimeout(resolve, delay))
        return api(config)
      }
    }

    return Promise.reject(error)
  },
)

export default api
