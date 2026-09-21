import { generateMessage } from './message'

/**
 * Messages about the run itself rather than about a test inside a file, so
 * unlike suite and test messages they carry no flowId.
 *
 * https://www.jetbrains.com/help/teamcity/service-messages.html#Reporting+Messages+for+Build+Log
 * https://www.jetbrains.com/help/teamcity/service-messages.html#Reporting+Build+Problems
 */
export const BuildMessage = {
  /** An error in the build log: `text` is the line, `details` expands under it. */
  error(text: string, details: string): string {
    return generateMessage('message', { text, errorDetails: details, status: 'ERROR' })
  },

  /** Fails the build and puts `description` into its status text. */
  problem(description: string): string {
    return generateMessage('buildProblem', { description })
  },
}
