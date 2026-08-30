import type { TestError } from '@vitest/utils'
import type { UserConsoleLog } from 'vitest'
import type { TaskOptions, TestCase, TestModule, TestSuite, Vitest } from 'vitest/node'
import MissingResultError from './error/missing-result.error'
import { escapeSpecials } from './escape'
import { SuiteMessage } from './messages/suite-message'
import { TestMessage } from './messages/test-message'

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
  public onRunEnd(testModules: ReadonlyArray<TestModule>): void {
    testModules.forEach((testModule) => {
      this.flushModule(testModule, false)
    })
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
      this.log(suiteMessage.finished())
      return
    }
    this.renderTest(item, complete)
  }

  private renderTest(testCase: TestCase, complete: boolean): void {
    const testMessage = new TestMessage(testCase)
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
