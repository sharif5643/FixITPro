import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/types'

export interface CartItem {
  product: Product
  quantity: number
  serialIds?: string[]  // pre-selected serial IDs (hasSerial products only)
}

interface CartStore {
  items: CartItem[]
  discount: number
  addItem: (product: Product, serialIds?: string[]) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  setDiscount: (discount: number) => void
  clearCart: () => void
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      discount: 0,

      addItem: (product, serialIds) => {
        const items = get().items

        // hasSerial products: quantity = serialIds.length; replace selection on re-add
        if (product.hasSerial && serialIds !== undefined) {
          if (serialIds.length === 0) {
            set({ items: items.filter((i) => i.product.id !== product.id) })
            return
          }
          const existing = items.find((i) => i.product.id === product.id)
          if (existing) {
            set({
              items: items.map((i) =>
                i.product.id === product.id
                  ? { ...i, quantity: serialIds.length, serialIds }
                  : i,
              ),
            })
          } else {
            set({ items: [...items, { product, quantity: serialIds.length, serialIds }] })
          }
          return
        }

        // Non-serial products: increment quantity (original logic)
        // branchQuantity is set by the backend when a branchId is in scope.
        // Use 0 as the strict fallback — never shadow-promote via product.stock,
        // which is a denormalized sum and can be stale / cross-branch.
        const available = product.branchQuantity ?? 0
        const existing  = items.find((i) => i.product.id === product.id)
        if (existing) {
          const newQty = existing.quantity + 1
          if (newQty > available) return
          set({
            items: items.map((i) =>
              i.product.id === product.id ? { ...i, quantity: newQty } : i,
            ),
          })
        } else {
          if (available < 1) return
          set({ items: [...items, { product, quantity: 1 }] })
        }
      },

      removeItem: (productId) =>
        set({ items: get().items.filter((i) => i.product.id !== productId) }),

      updateQuantity: (productId, quantity) => {
        if (quantity < 1) {
          set({ items: get().items.filter((i) => i.product.id !== productId) })
          return
        }
        const item = get().items.find((i) => i.product.id === productId)
        if (!item) return
        // hasSerial items: quantity is locked to serialIds.length — ignore manual changes
        if (item.serialIds) return
        const available = item.product.branchQuantity ?? 0
        if (quantity > available) return
        set({
          items: get().items.map((i) =>
            i.product.id === productId ? { ...i, quantity } : i,
          ),
        })
      },

      setDiscount: (discount) => set({ discount: Math.max(0, discount) }),
      clearCart: () => set({ items: [], discount: 0 }),
    }),
    { name: 'fixitpro-cart' },
  ),
)
