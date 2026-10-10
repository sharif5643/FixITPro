import { describe, it, expect } from 'vitest'
import { NEXT_ACTION, PATH_TO_DONE, canMoveRepair } from '@/lib/repair-status-flow'

describe('repair next step (web, staff app, SUNMI)', () => {
  it('every one-tap next step is a move the server allows', () => {
    for (const [from, { to }] of Object.entries(NEXT_ACTION)) {
      expect(canMoveRepair(from, to)).toBe(true)
    }
  })

  it('"done now" walks only allowed moves and ends at COMPLETED', () => {
    for (const [from, path] of Object.entries(PATH_TO_DONE)) {
      let at = from
      for (const to of path) {
        expect(canMoveRepair(at, to)).toBe(true)
        at = to
      }
      expect(at).toBe('COMPLETED')
    }
  })
})
