import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  tenantId?: string | null
  branchId?: string | null
  forcePasswordChange?: boolean
  tenantExpiryDate?: string | null
  shopName?: string | null
}

interface AuthState {
  user: AuthUser | null
  // CHB-01: accessToken removed — JWT lives in HttpOnly cookie, not client state
  permissions: string[]
  enabledModules: string[]
  _hasHydrated: boolean
  setAuth: (user: AuthUser, permissions: string[], enabledModules?: string[]) => void
  clearAuth: () => void
  updateUser: (updates: Partial<AuthUser>) => void
  hasPermission: (permission: string) => boolean
  hasModule: (moduleKey: string) => boolean
  isSuperAdmin: () => boolean
}

let _set: ((partial: Partial<AuthState>) => void) | null = null

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      _set = set
      return {
        user: null,
        permissions: [],
        enabledModules: [],
        _hasHydrated: false,
        setAuth: (user, permissions, enabledModules = []) => set({ user, permissions, enabledModules }),
        clearAuth: () => set({ user: null, permissions: [], enabledModules: [] }),
        updateUser: (updates) =>
          set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
        hasPermission: (permission: string) => {
          const { user, permissions } = get()
          if (!user) return false
          if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') return true
          return permissions.includes(permission)
        },
        hasModule: (moduleKey: string) => {
          const { user, enabledModules } = get()
          if (!user) return false
          if (user.role === 'SUPER_ADMIN') return true
          return enabledModules.includes(moduleKey)
        },
        isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
      }
    },
    {
      name: 'fixitpro-auth',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined') return localStorage
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        }
      }),
      // CHB-01: accessToken excluded — cookie handles auth, not localStorage
      partialize: (state) => ({
        user: state.user,
        permissions: state.permissions,
        enabledModules: state.enabledModules,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[Auth] Store rehydration failed:', error)
          }
          if (state) {
            state._hasHydrated = true
            console.log(
              '[Auth] Store hydrated — role:', state.user?.role ?? 'none',
            )
          }
          _set?.({ _hasHydrated: true })
        }
      },
    },
  ),
)
