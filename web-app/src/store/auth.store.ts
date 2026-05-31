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
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  permissions: string[]
  _hasHydrated: boolean
  setAuth: (user: AuthUser, token: string, permissions: string[]) => void
  clearAuth: () => void
  updateUser: (updates: Partial<AuthUser>) => void
  hasPermission: (permission: string) => boolean
  isSuperAdmin: () => boolean
}

// `set` is captured from the factory so `onRehydrateStorage` can trigger
// subscriber notifications without forward-referencing `useAuthStore`
// (which would cause a TDZ error: "Cannot access before initialization").
let _set: ((partial: Partial<AuthState>) => void) | null = null

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      _set = set // capture before returning — always runs synchronously
      return {
        user: null,
        accessToken: null,
        permissions: [],
        _hasHydrated: false,
        setAuth: (user, accessToken, permissions) =>
          set({ user, accessToken, permissions }),
        clearAuth: () => set({ user: null, accessToken: null, permissions: [] }),
        updateUser: (updates) =>
          set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
        hasPermission: (permission: string) => {
          const { user, permissions } = get()
          if (!user) return false
          if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') return true
          return permissions.includes(permission)
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
      // Only write these three fields to localStorage — _hasHydrated is transient
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        permissions: state.permissions,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[Auth] Store rehydration failed:', error)
          }
          if (state) {
            // Direct mutation so any synchronous reads after hydration see true
            state._hasHydrated = true
            console.log(
              '[Auth] Store hydrated — token:',
              state.accessToken ? 'present' : 'missing',
              '| role:', state.user?.role ?? 'none',
            )
          }
          // Call set() to notify all React subscribers (direct mutation alone
          // does not trigger zustand's subscription system)
          _set?.({ _hasHydrated: true })
        }
      },
    },
  ),
)
