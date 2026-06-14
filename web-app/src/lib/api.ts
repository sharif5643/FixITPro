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

// ── Response interceptor: retry + 401 redirect ───────────────
// Guard prevents multiple concurrent 401s from firing multiple redirects
let _redirectingToLogin = false

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetryConfig
    const status: number | undefined = error.response?.status

    // 401 → force logout (except on login/register — those handle their own errors)
    // /auth/me and /auth/logout are NOT excluded so an expired cookie clears properly.
    const isLoginOrRegister = /\/auth\/(login|register)/.test(config?.url ?? '')
    const isLogout = /\/auth\/logout/.test(config?.url ?? '')
    if (status === 401 && typeof window !== 'undefined' && !isLoginOrRegister && !isLogout) {
      if (_redirectingToLogin) return Promise.reject(error)
      _redirectingToLogin = true
      useAuthStore.getState().clearAuth()
      // Clear the invalid/expired HttpOnly cookie server-side so the Next.js
      // middleware won't redirect /login → /dashboard in a loop.
      try { await api.post('/auth/logout') } catch { /* best-effort */ }
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Retry on network errors or 5xx (max 2 retries, exponential backoff)
    const MAX_RETRIES = 2
    const isNetworkError = !error.response
    const isServerError  = status !== undefined && status >= 500

    const isAuthEndpoint = isLoginOrRegister || isLogout || /\/auth\//.test(config?.url ?? '')
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
