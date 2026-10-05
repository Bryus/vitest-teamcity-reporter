import { afterAll, describe, expect, it } from 'vitest'

describe('Cleanup suite', () => {
  afterAll(() => {
    throw new Error('cleanup failed')
  })

  it('should pass before the cleanup fails', () => {
    expect(true).toBe(true)
  })
})
