import { expect, it } from 'vitest'

// Mirrors a global that only the main build config defines: the module throws
// while importing, so vitest collects no tests from it at all.
declare const __NOT_DEFINED__: string
const version: string = __NOT_DEFINED__

it('is never collected', () => {
  expect(version).toBeDefined()
})
