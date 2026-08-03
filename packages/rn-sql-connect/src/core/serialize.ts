import { SqlConnectError } from './errors'
import type { Variables } from './types'

/**
 * Serialises operation variables for the bridge.
 *
 * `undefined` properties are dropped rather than sent as null. In GraphQL those
 * are different things: dropping means "leave the argument out", null means
 * "set this to null". Data Connect mutations act on that difference.
 */
export const serializeVariables = (variables: Variables): string => {
  if (variables === undefined || variables === null) {
    return '{}'
  }
  if (typeof variables !== 'object' || Array.isArray(variables)) {
    throw new SqlConnectError({
      code: 'invalid-argument',
      message: 'Operation variables must be a plain object.',
    })
  }
  try {
    return JSON.stringify(variables, (_key, value) => (value === undefined ? undefined : value))
  } catch (error) {
    throw new SqlConnectError({
      code: 'invalid-argument',
      message: `Operation variables are not JSON serialisable: ${String(error)}`,
      cause: error,
    })
  }
}

/**
 * Stable stringify used to key subscriptions.
 *
 * Object key order must not create a second native subscription for what is the
 * same query, so keys are sorted at every level.
 */
export const stableKey = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const parts = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableKey(record[key])}`)
  return `{${parts.join(',')}}`
}
