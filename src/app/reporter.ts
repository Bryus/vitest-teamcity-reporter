import type { UserConsoleLog } from 'vitest'
import type { Reporter, SerializedError, TestModule, TestRunEndReason, Vitest } from 'vitest/node'
import { Printer } from './printer'

export interface TeamCityReporterOptions {
  /**
   * Name of an extra suite wrapping every test module, e.g. the application
   * name. TeamCity merges tests with identical full names, so two apps
   * running the same relative test files need distinct roots to be counted
   * separately. Falls back to the TEAMCITY_ROOT_SUITE environment variable.
   */
  rootSuite?: string
}

class TeamCityReporter implements Reporter {
  private logger!: Vitest['logger']
  private printer!: Printer
  private readonly rootSuite: string | undefined

  constructor(options: TeamCityReporterOptions = {}) {
    this.rootSuite = options.rootSuite ?? process.env.TEAMCITY_ROOT_SUITE
  }

  onInit(ctx: Vitest): void {
    this.logger = ctx.logger
    this.printer = new Printer(this.logger, this.rootSuite)
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.printer.onModuleEnd(testModule)
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason,
  ): void {
    this.printer.onRunEnd(testModules, unhandledErrors, reason)
  }

  onUserConsoleLog(log: UserConsoleLog): void {
    if (log.taskId != null) {
      this.printer.addTestConsoleLog(log.taskId, log)
    } else {
      this.logger.console.log(log)
    }
  }
}

export { TeamCityReporter }
