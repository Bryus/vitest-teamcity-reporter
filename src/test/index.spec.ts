import { describe, expect, it, vi } from 'vitest'
import { configDefaults } from 'vitest/config'
import { createVitest, type InlineConfig, type Vitest } from 'vitest/node'
import TeamCityReporter from '../app'
import missTestWithProblemExpect from './miss-test-result/miss-test-result-with-problem.expect'
import missTestWithoutProblemExpect from './miss-test-result/miss-test-result-without-problem.expect'
import passedAfterRetryExpect from './retry/passed-after-retry.expect'
import sequenceAsyncExpect from './sequence-check/async.expect'
import sequenceAsyncSecondExpect from './sequence-check/async-2.expect'
import sequenceSyncExpect from './sequence-check/sync.expect'
import workCheckExpect from './simple/work-check.expect'
import { compareResultWithExpect, generateExpectTest } from './utils'

describe('main tests', () => {
  // biome-ignore lint/suspicious/noExplicitAny: fine for the test
  let consoleStub: any

  const startTest = async (
    paths: string[],
    config: Partial<InlineConfig> = {},
    reporter: TeamCityReporter = new TeamCityReporter(),
  ): Promise<void> => {
    consoleStub = { info: vi.fn(), log: vi.fn() }
    const vitest = await createVitest('test', {
      ...configDefaults,
      ...config,
      watch: false,
      reporters: reporter,
    })
    vitest.logger.console = consoleStub as Console
    await vitest.start(paths)
    await vitest.close()
  }

  const getCalls = (): { info: string[]; log: string[] } => ({
    info: consoleStub.info.mock.calls.flatMap((value: string[]) => value),
    log: consoleStub.log.mock.calls.flatMap((value: string[]) => value),
  })

  it('should run test and log into info', async () => {
    await startTest(['./simple/work-check.spec.ts'])
    const { info } = getCalls()

    expect(consoleStub.info).toHaveBeenCalled()
    expect(consoleStub.log).not.toHaveBeenCalled()
    expect(info.length).toEqual(13)
    compareResultWithExpect(workCheckExpect, info)
  })

  it('should exclude case when miss result test if before/after hooks have a idle', async () => {
    await startTest(['./miss-test-result'])
    const { info } = getCalls()

    expect(consoleStub.info).toHaveBeenCalled()
    const expectMap = {
      [missTestWithProblemExpect[0][1]]: missTestWithProblemExpect,
      [missTestWithoutProblemExpect[0][1]]: missTestWithoutProblemExpect,
    }
    generateExpectTest(info, expectMap)
  })

  it('should run test and log into info', async () => {
    await startTest(['./sequence-check'])
    const { info } = getCalls()

    expect(consoleStub.info).toHaveBeenCalled()
    const expectMap = {
      [sequenceAsyncExpect[0][1]]: sequenceAsyncExpect,
      [sequenceAsyncSecondExpect[0][1]]: sequenceAsyncSecondExpect,
      [sequenceSyncExpect[0][1]]: sequenceSyncExpect,
    }
    generateExpectTest(info, expectMap)
  })

  it('should wrap every module into the configured root suite', async () => {
    await startTest(['./simple/work-check.spec.ts'], {}, new TeamCityReporter({ rootSuite: 'Front' }))
    const { info } = getCalls()

    expect(consoleStub.info).toHaveBeenCalled()
    expect(info.length).toEqual(workCheckExpect.length + 2)
    const wrapped = [['testSuiteStarted', 'Front'], ...workCheckExpect, ['testSuiteFinished', 'Front']]
    compareResultWithExpect(wrapped, info)
  })

  it('should keep every flow strictly sequenced', async () => {
    await startTest(['./simple', './sequence-check', './miss-test-result', './retry/passed-after-retry.spec.ts'], {
      retry: 1,
    })
    const { info } = getCalls()
    expect(consoleStub.info).toHaveBeenCalled()

    const messages = info.map((message) => ({
      type: /##teamcity\[(\w+) /.exec(message)?.[1] ?? '',
      flowId: /flowId='(.+?)'/.exec(message)?.[1] ?? '',
      name: /name='(.+?)'/.exec(message)?.[1] ?? '',
    }))
    const flows = new Map<string, { stack: string[]; openTest: string | undefined }>()
    for (const message of messages) {
      const flow = flows.get(message.flowId) ?? { stack: [], openTest: undefined }
      flows.set(message.flowId, flow)
      switch (message.type) {
        case 'testSuiteStarted':
          expect(flow.openTest, `suite ${message.name} opened inside test ${flow.openTest}`).toBeUndefined()
          flow.stack.push(message.name)
          break
        case 'testSuiteFinished':
          expect(flow.openTest, `suite ${message.name} closed inside test ${flow.openTest}`).toBeUndefined()
          expect(flow.stack.pop(), `suite ${message.name} closed out of order`).toBe(message.name)
          break
        case 'testStarted':
          expect(flow.openTest, `tests overlap: ${flow.openTest} and ${message.name}`).toBeUndefined()
          expect(flow.stack.length, `test ${message.name} outside any suite`).toBeGreaterThan(0)
          flow.openTest = message.name
          break
        case 'testFailed':
        case 'testStdOut':
        case 'testStdErr':
          expect(message.name, `${message.type} outside its test`).toBe(flow.openTest)
          break
        case 'testFinished':
          expect(message.name, 'testFinished does not match started test').toBe(flow.openTest)
          flow.openTest = undefined
          break
        case 'testIgnored':
          expect(flow.openTest, `testIgnored inside open test ${flow.openTest}`).toBeUndefined()
          break
      }
    }
    flows.forEach((flow, flowId) => {
      expect(flow.stack, `unclosed suites in ${flowId}`).toEqual([])
      expect(flow.openTest, `unclosed test in ${flowId}`).toBeUndefined()
    })
  })

  it('should report an error that belongs to no test', async () => {
    await startTest(['./unhandled/unhandled-error.spec.ts'])
    const { info } = getCalls()

    expect(info.some((message) => message.includes('##teamcity[testFailed '))).toBe(false)
    const error = info.find((message) => message.includes('##teamcity[message ') && message.includes("status='ERROR'"))
    expect(error, 'the unhandled error is not in the log').toBeDefined()
    expect(error).toContain('boom after the test')
    const problem = info.find((message) => message.includes('##teamcity[buildProblem '))
    expect(problem, 'the build has no problem to show in its status').toBeDefined()
    expect(problem).toContain('Vitest: 1 unhandled error')
  })

  it('should leave a clean run without a build problem', async () => {
    await startTest(['./simple/work-check.spec.ts'])
    const { info } = getCalls()

    expect(info.some((message) => message.includes('##teamcity[buildProblem '))).toBe(false)
    expect(info.some((message) => message.includes("status='ERROR'"))).toBe(false)
  })

  it('should report an interrupted run and unwrap the cause chain', () => {
    const consoleStub = { info: vi.fn(), log: vi.fn() }
    const reporter = new TeamCityReporter()
    reporter.onInit({ logger: { console: consoleStub } } as unknown as Vitest)

    reporter.onTestRunEnd([], [], 'interrupted')
    expect(consoleStub.info.mock.calls.flat().join('\n')).toContain('the test run was interrupted')

    consoleStub.info.mockClear()
    reporter.onTestRunEnd(
      [],
      [
        {
          name: 'Error',
          message: 'browser connection was closed',
          stack: 'Error: browser connection was closed\n    at outer',
          cause: { name: 'Error', message: 'rpc is closed', stack: 'Error: rpc is closed\n    at inner' },
        },
      ],
      'failed',
    )
    const messages: string[] = consoleStub.info.mock.calls.flat()
    expect(messages.join('\n')).toContain('Caused by: Error: rpc is closed')
    expect(messages.find((message) => message.includes('##teamcity[buildProblem '))).toContain(
      'Vitest: 1 unhandled error — Error: browser connection was closed',
    )
  })

  it('should not emit testFailed when a test passes after retry', async () => {
    await startTest(['./retry/passed-after-retry.spec.ts'], { retry: 1 })
    const { info } = getCalls()

    expect(consoleStub.info).toHaveBeenCalled()
    expect(info.some((message) => message.includes('##teamcity[testFailed '))).toBe(false)
    expect(info.some((message) => message.includes('flaky: passed after retry (1 failed attempt)'))).toBe(true)
    compareResultWithExpect(passedAfterRetryExpect, info)
  })
})
