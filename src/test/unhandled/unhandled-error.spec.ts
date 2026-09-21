import { describe, expect, it } from 'vitest'

describe('Unhandled suite', () => {
  it('should pass and leave an error behind', () => {
    // fires once this test is over, so vitest cannot attribute it to any test
    setTimeout(() => {
      throw new Error('boom after the test')
    }, 10)
    expect(true).toBe(true)
  })

  it('should keep the run alive until the error lands', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(true).toBe(true)
  })
})
