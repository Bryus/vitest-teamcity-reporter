import { describe, expect, it } from 'vitest'

let attempt = 0

describe('Retry suite', () => {
  it('should pass on the second attempt', () => {
    attempt += 1
    expect(attempt).toBeGreaterThan(1)
  })
})
