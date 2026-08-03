import type { Duration } from './types'

const PATTERN = /(\d+(?:\.\d+)?)(ms|s|m|h)/g

const UNIT_SECONDS: Record<string, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
}

/**
 * Parses a duration into seconds.
 *
 * Accepts plain numbers (already seconds) and the `connector.yaml` syntax
 * (`"0"`, `"30s"`, `"5m"`, `"1h30m"`) so that a cache policy can be copied
 * between the YAML config and this SDK without translating units. Android takes
 * a `kotlin.time.Duration` and Apple takes a `TimeInterval`, so seconds is the
 * one representation both sides agree on.
 */
export const durationToSeconds = (value: Duration): number => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`Invalid duration: ${value}`)
    }
    return value
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new TypeError('Invalid duration: empty string')
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  let total = 0
  let matchedLength = 0
  PATTERN.lastIndex = 0
  for (let match = PATTERN.exec(trimmed); match !== null; match = PATTERN.exec(trimmed)) {
    total += Number(match[1]) * UNIT_SECONDS[match[2]]
    matchedLength += match[0].length
  }

  if (matchedLength !== trimmed.length) {
    throw new TypeError(`Invalid duration: ${value}`)
  }
  return total
}
