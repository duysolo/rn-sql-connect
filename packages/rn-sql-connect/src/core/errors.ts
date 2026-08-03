/**
 * Canonical error codes.
 *
 * Android throws a tree of exceptions while Apple platforms expose four
 * unrelated structs, so neither taxonomy maps cleanly onto the other. Native
 * code normalises into this list and keeps the platform code in `nativeCode`.
 */
export type SqlConnectErrorCode =
  | 'unauthenticated'
  | 'unauthorized'
  | 'not-found'
  | 'invalid-argument'
  | 'partial-error'
  | 'unavailable'
  | 'cancelled'
  | 'not-configured'
  | 'internal'
  | 'unknown'

export type GraphQLErrorInfo = {
  message: string
  /** Field path of the error, e.g. `["movies", 0, "title"]`. */
  path: (string | number)[]
}

export type SqlConnectErrorInit = {
  code?: SqlConnectErrorCode
  message: string
  operationName?: string
  graphQLErrors?: GraphQLErrorInfo[]
  partialData?: unknown
  nativeCode?: string
  cause?: unknown
}

export class SqlConnectError extends Error {
  readonly code: SqlConnectErrorCode
  readonly operationName?: string
  readonly graphQLErrors: GraphQLErrorInfo[]
  /**
   * Data Connect can answer with data AND errors at the same time. When that
   * happens `code` is `partial-error` and this holds whatever did resolve.
   * Deciding whether partial data is usable is the caller's call, not ours.
   */
  readonly partialData?: unknown
  readonly nativeCode?: string

  constructor(init: SqlConnectErrorInit) {
    super(init.message)
    this.name = 'SqlConnectError'
    this.code = init.code ?? 'unknown'
    this.operationName = init.operationName
    this.graphQLErrors = init.graphQLErrors ?? []
    this.partialData = init.partialData
    this.nativeCode = init.nativeCode
    if (init.cause !== undefined) {
      // `cause` is not in the RN Hermes lib target yet, so assign defensively.
      ;(this as { cause?: unknown }).cause = init.cause
    }
    Object.setPrototypeOf(this, SqlConnectError.prototype)
  }
}

const KNOWN_CODES = new Set<string>([
  'unauthenticated',
  'unauthorized',
  'not-found',
  'invalid-argument',
  'partial-error',
  'unavailable',
  'cancelled',
  'not-configured',
  'internal',
  'unknown',
])

const asCode = (value: unknown): SqlConnectErrorCode =>
  typeof value === 'string' && KNOWN_CODES.has(value) ? (value as SqlConnectErrorCode) : 'unknown'

const asGraphQLErrors = (value: unknown): GraphQLErrorInfo[] => {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) {
      return []
    }
    const record = entry as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : ''
    const path = Array.isArray(record.path)
      ? record.path.filter((segment): segment is string | number => {
          return typeof segment === 'string' || typeof segment === 'number'
        })
      : []
    return [{ message, path }]
  })
}

/** Builds a `SqlConnectError` from the JSON error object native sends. */
export const errorFromPayload = (payload: unknown, operationName?: string): SqlConnectError => {
  if (typeof payload !== 'object' || payload === null) {
    return new SqlConnectError({ message: 'Unknown Data Connect error', operationName })
  }
  const record = payload as Record<string, unknown>
  return new SqlConnectError({
    code: asCode(record.code),
    message: typeof record.message === 'string' ? record.message : 'Unknown Data Connect error',
    operationName: typeof record.operationName === 'string' ? record.operationName : operationName,
    graphQLErrors: asGraphQLErrors(record.graphQLErrors),
    partialData: record.partialData ?? undefined,
    nativeCode: typeof record.nativeCode === 'string' ? record.nativeCode : undefined,
  })
}

type RejectedNativeCall = {
  code?: string
  message?: string
  userInfo?: Record<string, unknown>
}

/**
 * Converts a rejected TurboModule promise into a `SqlConnectError`.
 *
 * React Native surfaces `reject(code, message, userInfo)` as an Error carrying
 * `code` and `userInfo`, so the structured detail travels in `userInfo.details`
 * as JSON.
 */
export const errorFromRejection = (error: unknown, operationName?: string): SqlConnectError => {
  if (error instanceof SqlConnectError) {
    if (!error.operationName && operationName) {
      // Errors raised while configuring do not know the operation yet, so name
      // it here. Otherwise a report says only "no Firebase app" with no clue
      // about which call hit it.
      return new SqlConnectError({
        code: error.code,
        message: error.message,
        operationName,
        graphQLErrors: error.graphQLErrors,
        partialData: error.partialData,
        nativeCode: error.nativeCode,
      })
    }
    return error
  }
  const rejection = (error ?? {}) as RejectedNativeCall
  const rawDetails = rejection.userInfo?.details
  if (typeof rawDetails === 'string' && rawDetails.length > 0) {
    try {
      return errorFromPayload(JSON.parse(rawDetails), operationName)
    } catch {
      // Fall through to the generic mapping below.
    }
  }
  return new SqlConnectError({
    code: asCode(rejection.code),
    message: rejection.message ?? String(error),
    operationName,
    nativeCode: rejection.code,
    cause: error,
  })
}
