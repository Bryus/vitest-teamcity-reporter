import type { SerializedError, TestError } from '@vitest/utils'
import type { UserConsoleLog } from 'vitest'
import type { TaskOptions, TestCase, TestModule, TestRunEndReason, TestSuite, Vitest } from 'vitest/node'
import { detailsOf, headlineOf } from './error/format'
import MissingResultError from './error/missing-result.error'
import { escapeSpecials } from './escape'
import { BuildMessage } from './messages/build-message'
import { SuiteMessage } from './messages/suite-message'
import { TestMessage } from './messages/test-message'

/** TeamCity cuts a longer description from its beginning — keep the headline. */
const MAX_PROBLEM_DESCRIPTION = 1000

/**
 * Names of the synthetic tests that carry errors no real test reported:
 * a module that failed to import has no tests at all, and a failing
 * afterAll leaves every test of its suite green.
 */
export const MODULE_ERROR_TEST = '(module error)'
export const SUITE_ERROR_TEST = '(suite error)'

const truncate = (description: string): string => {
  return description.length <= MAX_PROBLEM_DESCRIPTION
    ? description
    : `${description.slice(0, MAX_PROBLEM_DESCRIPTION - 1)}…`
}

/**
 * Renders every test module as one atomic block when the module finishes.
 *
 * Vitest 4 dispatches reporter callbacks in batches, so streaming messages
 * from onTestCaseReady/onTestCaseResult interleaves testStarted/testFinished
 * of different tests inside one flow, can lose the trailing testFinished and
 * closes suites out of order or under a different name — TeamCity then
 * miscounts tests. Rendering from the final task tree makes the sequence
 * correct by construction: tree order, every testStarted immediately paired
 * with its testFinished, suites opened and closed with the same name.
 */
export class Printer {
  private readonly testConsoleMap = new Map<string, UserConsoleLog[]>()
  private readonly flushedModules = new Set<string>()
  /** Errors already sent as testFailed of some test — not to be reported twice. */
  private readonly reportedErrors = new WeakSet<object>()

  constructor(
    private readonly logger: Vitest['logger'],
    private readonly rootSuite?: string,
  ) {}

  public onModuleEnd(testModule: TestModule): void {
    this.flushModule(testModule, true)
  }

  /**
   * Fallback for modules that never reported onTestModuleEnd (the run was
   * interrupted or a test hung): flush what is known so TeamCity still sees
   * their finished tests, and fail the ones without a result to point at
   * the place where the run stopped.
   */
  public onRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError> = [],
    reason?: TestRunEndReason,
  ): void {
    testModules.forEach((testModule) => {
      this.flushModule(testModule, false)
    })
    this.reportRunFailure(unhandledErrors, reason)
  }

  public addTestConsoleLog(id: string, log: UserConsoleLog): void {
    const messages = this.testConsoleMap.get(id)
    if (messages != null) {
      messages.push(log)
    } else {
      this.testConsoleMap.set(id, [log])
    }
  }

  private flushModule(testModule: TestModule, complete: boolean): void {
    if (this.flushedModules.has(testModule.moduleId)) {
      return
    }
    this.flushedModules.add(testModule.moduleId)
    // The root suite must live inside the module's own flow: TeamCity nests
    // suites per flowId, so a wrapper emitted outside the flow would not
    // become part of the tests' full names.
    const rootMessage =
      this.rootSuite != null ? new SuiteMessage(testModule.moduleId, escapeSpecials(this.rootSuite)) : undefined
    if (rootMessage) {
      this.log(rootMessage.started())
    }
    const suiteMessage = new SuiteMessage(testModule.moduleId, escapeSpecials(testModule.relativeModuleId))
    this.log(suiteMessage.started())
    for (const child of testModule.children) {
      this.render(child, complete)
    }
    this.renderUnreportedErrors(testModule.moduleId, MODULE_ERROR_TEST, testModule.errors())
    this.log(suiteMessage.finished())
    if (rootMessage) {
      this.log(rootMessage.finished())
    }
  }

  private render(item: TestCase | TestSuite, complete: boolean): void {
    if (item.type === 'suite') {
      if (this.isSkippedOrTodo(item)) {
        return
      }
      const suiteMessage = new SuiteMessage(item.module.moduleId, escapeSpecials(item.name))
      this.log(suiteMessage.started())
      for (const child of item.children) {
        this.render(child, complete)
      }
      this.renderUnreportedErrors(item.module.moduleId, SUITE_ERROR_TEST, item.errors())
      this.log(suiteMessage.finished())
      return
    }
    this.renderTest(item, complete)
  }

  /**
   * Module and suite errors reach TeamCity only through the tests they fail.
   * Without such a test — the file threw while importing, or afterAll threw
   * after every test passed — vitest exits non-zero while TeamCity shows only
   * passed tests. A synthetic failed test keeps the error and its location.
   */
  private renderUnreportedErrors(flowId: string, name: string, errors: ReadonlyArray<TestError>): void {
    const unreported = errors.filter((error) => !this.reportedErrors.has(error))
    if (unreported.length === 0) {
      return
    }
    const testMessage = new TestMessage(flowId, name)
    this.log(testMessage.started())
    unreported.forEach((error) => {
      this.reportedErrors.add(error)
      this.log(testMessage.fail(error))
    })
    this.log(testMessage.finished(0))
  }

  private renderTest(testCase: TestCase, complete: boolean): void {
    const testMessage = TestMessage.of(testCase)
    const result = testCase.result()

    if (this.isSkippedOrTodo(testCase)) {
      this.log(testMessage.ignored())
      return
    }

    // Check for errors even if state is not 'failed': a failed hook marks its
    // tests as skipped, yet they must be reported as failures, not ignores.
    const errors = this.getTestErrors(testCase)
    const hasRealErrors = errors.length > 0 && !(errors[0] instanceof MissingResultError)

    if (result.state === 'skipped' && !hasRealErrors) {
      this.log(testMessage.ignored())
      return
    }

    this.log(testMessage.started())

    const logs = this.testConsoleMap.get(testCase.id) ?? []
    logs.forEach((log) => {
      this.log(testMessage.log(log.type, log.content))
    })
    this.testConsoleMap.delete(testCase.id)

    if (!complete && result.state === 'pending' && !hasRealErrors) {
      // Interrupted run: the test never produced a result.
      this.log(testMessage.fail(new MissingResultError(testCase)))
    } else if (result.state === 'failed' || (result.state !== 'passed' && hasRealErrors)) {
      errors.forEach((error) => {
        this.reportedErrors.add(error)
        this.log(testMessage.fail(error))
      })
    } else if (hasRealErrors) {
      // Passed after retry: the run is green, so emitting testFailed would wrongly
      // fail the TeamCity build. Keep a trace of the flake in stderr instead.
      const attempts = errors.length
      this.log(testMessage.stdErr(`flaky: passed after retry (${attempts} failed attempt${attempts === 1 ? '' : 's'})`))
    }

    this.log(testMessage.finished(testCase.diagnostic()?.duration ?? 0))
  }

  /**
   * Failures that belong to no test: unhandled rejections, a crashed worker,
   * anything thrown after its module finished, or an aborted run. Vitest exits
   * non-zero for them while every test stays green, so without a report the
   * build fails with nothing in the log but the exit code.
   */
  private reportRunFailure(errors: ReadonlyArray<SerializedError>, reason?: TestRunEndReason): void {
    errors.forEach((error) => {
      this.log(BuildMessage.error(headlineOf(error), detailsOf(error)))
    })
    if (errors.length > 0) {
      const count = errors.length === 1 ? '1 unhandled error' : `${errors.length} unhandled errors`
      this.log(BuildMessage.problem(truncate(`Vitest: ${count} — ${headlineOf(errors[0])}`)))
      return
    }
    if (reason === 'interrupted') {
      this.log(BuildMessage.problem('Vitest: the test run was interrupted'))
    }
  }

  private log(message: string): void {
    this.logger.console.info(message)
  }

  private isSkippedOrTodo(item: { options: { mode?: TaskOptions['mode'] } }): boolean {
    if (item.options.mode === undefined) {
      return false
    }
    return ['skip', 'todo'].includes(item.options.mode)
  }

  private getTestErrors(testCase: TestCase): TestError[] {
    const result = testCase.result()

    // Check test errors first
    if (result.errors !== undefined && result.errors.length > 0) {
      return [...result.errors]
    }

    // Check parent suite errors (e.g., from failed hooks)
    let current: TestCase | TestSuite | TestModule = testCase.parent
    while (current.type !== 'module') {
      if (current.type === 'suite') {
        const suiteErrors = current.errors()
        if (suiteErrors.length > 0) {
          return suiteErrors
        }
      }
      current = current.parent
    }

    // Check module errors (current is always 'module' here)
    const moduleErrors = current.errors()
    if (moduleErrors.length > 0) {
      return moduleErrors
    }

    return [new MissingResultError(testCase)]
  }
}
