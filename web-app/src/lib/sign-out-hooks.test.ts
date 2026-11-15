import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('sign-out hooks', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules() })

  it('signing out runs the sign-out hooks (query cache cleared); a hook that throws does not stop the rest', async () => {
    const m = await import('./sign-out-hooks')
    const a = vi.fn(() => { throw new Error('x') }); const b = vi.fn()
    m.registerOnSignOut(a); m.registerOnSignOut(b)
    m.runSignOut()
    expect(a).toHaveBeenCalled(); expect(b).toHaveBeenCalled()
  })

  it('the same person signing in again keeps their cart; a different person starts clean', async () => {
    const m = await import('./sign-out-hooks')
    const change = vi.fn()
    m.registerOnUserChange(change)
    m.noteSignedIn('u1')
    m.noteSignedIn('u1')
    expect(change).not.toHaveBeenCalled()
    m.noteSignedIn('u2')
    expect(change).toHaveBeenCalledTimes(1)
  })

  it('auth store: clearAuth runs sign-out; setAuth with another user clears the cart', async () => {
    const { useAuthStore } = await import('@/store/auth.store')
    const { useCartStore } = await import('@/store/cart.store')
    const hooks = await import('./sign-out-hooks')
    const out = vi.fn(); hooks.registerOnSignOut(out)
    const u = (id: string) => ({ id, name: id, email: `${id}@x`, role: 'CASHIER' } as any)
    useAuthStore.getState().setAuth(u('a'), [])
    useCartStore.setState({ items: [{ productId: 'p' } as any] })
    useAuthStore.getState().clearAuth()
    expect(out).toHaveBeenCalled()
    useAuthStore.getState().setAuth(u('a'), [])
    expect(useCartStore.getState().items).toHaveLength(1)   // same person: cart kept
    useAuthStore.getState().clearAuth()
    useAuthStore.getState().setAuth(u('b'), [])
    expect(useCartStore.getState().items).toHaveLength(0)   // someone else: cart gone
  })
})
