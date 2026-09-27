import { describe, expect, it } from 'vitest'

describe('Durations', () => {
  it('should report the time the test took', async () => {
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(true).toBeTruthy()
  })
})
