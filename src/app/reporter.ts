import type { UserConsoleLog } from 'vitest'
import type { Reporter, SerializedError, TestModule, TestRunEndReason, Vitest } from 'vitest/node'
import { Printer } from './printer'

class TeamCityReporter implements Reporter {
  private logger!: Vitest['logger']
  private printer!: Printer

  onInit(ctx: Vitest): void {
    this.logger = ctx.logger
    this.printer = new Printer(this.logger)
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.printer.onModuleEnd(testModule)
  }

  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    _unhandledErrors: ReadonlyArray<SerializedError>,
    _reason: TestRunEndReason,
  ): void {
    this.printer.onRunEnd(testModules)
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
