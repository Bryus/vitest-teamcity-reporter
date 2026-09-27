import type { TestError } from '@vitest/utils'
import type { TestCase } from 'vitest/node'
import { Message, type Parameters } from './message'

/**
 * TeamCity parses `duration` as an integer number of milliseconds. Vitest
 * measures with performance.now(), so the value is fractional: TeamCity then
 * drops it and times the test by the gap between testStarted and testFinished,
 * which is ~0 ms because every module is rendered in one block.
 */
export const toTeamCityDuration = (duration: number): number => {
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0
}

export class TestMessage extends Message {
  constructor(testCase: TestCase) {
    super(testCase.module.moduleId, testCase.name)
  }

  protected generate(type: string, parameters: Parameters = {}): string {
    return this.generateTeamcityMessage(type, this.id, { ...parameters, name: this.name })
  }

  fail(error: TestError): string {
    return this.generate('testFailed', {
      message: error.message,
      details: error.stack ?? '',
      actual: String(error.actual ?? ''),
      expected: String(error.expected ?? ''),
    })
  }

  started(): string {
    return this.generate('testStarted')
  }

  finished(duration: number): string {
    return this.generate('testFinished', { duration: toTeamCityDuration(duration) })
  }

  ignored(): string {
    return this.generate('testIgnored')
  }

  stdOut(out: string): string {
    return this.generate('testStdOut', { out })
  }

  stdErr(out: string): string {
    return this.generate('testStdErr', { out })
  }

  log(type: 'stdout' | 'stderr', out: string): string {
    return type === 'stdout' ? this.stdOut(out) : this.stdErr(out)
  }
}
