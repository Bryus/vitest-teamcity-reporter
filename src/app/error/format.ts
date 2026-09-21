import type { SerializedError } from '@vitest/utils'

/** A cause chain is normally two or three deep; the bound only guards a cycle. */
const MAX_CAUSE_DEPTH = 10

/** `name: message`, the way a thrown error prints itself. */
export const headlineOf = (error: SerializedError): string => {
  const message = (error.message ?? '').trim()
  const name = (error.name ?? '').trim()
  if (message === '') {
    return name === '' ? 'Unknown error' : name
  }
  return name === '' || message.startsWith(name) ? message : `${name}: ${message}`
}

/**
 * Stack plus the `cause` chain: vitest wraps a worker failure into the error
 * that broke the run, and the original reason is the innermost cause.
 */
export const detailsOf = (error: SerializedError): string => {
  const parts: string[] = []
  let current: SerializedError | undefined = error
  for (let depth = 0; current != null && depth < MAX_CAUSE_DEPTH; depth += 1) {
    const body = (current.stack ?? '').trim() === '' ? headlineOf(current) : (current.stack as string)
    parts.push(depth === 0 ? body : `Caused by: ${body}`)
    current = current.cause
  }
  return parts.join('\n')
}
