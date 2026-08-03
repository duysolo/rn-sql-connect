/** Identifies a deployed connector, mirroring `ConnectorConfig` in every Data Connect SDK. */
export type ConnectorConfig = {
  connector: string
  location: string
  serviceId: string
}

/**
 * Where a query result came from.
 *
 * Always check this when a stale read would be a bug. A cached value looks
 * exactly like a fresh one at the call site otherwise.
 */
export type DataSource = 'cache' | 'server'

/**
 * Fetch policies, matching `QueryRef.FetchPolicy` on Android and
 * `QueryFetchPolicy` on Apple platforms.
 *
 * PREFER_CACHE is the default of both native SDKs. With the default
 * `maxAge` of 0 it still revalidates against the server on every call, so it
 * only serves cached data once you raise `maxAge`.
 */
export const QueryFetchPolicy = {
  PREFER_CACHE: 'PREFER_CACHE',
  CACHE_ONLY: 'CACHE_ONLY',
  SERVER_ONLY: 'SERVER_ONLY',
} as const

export type QueryFetchPolicy = (typeof QueryFetchPolicy)[keyof typeof QueryFetchPolicy]

export type CacheStorage = 'persistent' | 'memory'

/**
 * A duration in seconds, or a string using the same syntax as `connector.yaml`
 * (`"0"`, `"30s"`, `"5m"`, `"1h30m"`).
 */
export type Duration = number | string

export type CacheSettings = {
  /** Defaults to `persistent` on both platforms. */
  storage?: CacheStorage
  /**
   * How long a cached response may be served before the SDK refetches.
   * Defaults to 0, meaning responses are cached but never served unless the
   * caller asks for CACHE_ONLY.
   */
  maxAge?: Duration
}

export type SqlConnectSettings = {
  /** Firebase app to run under. Defaults to the `[DEFAULT]` app. */
  appName?: string
  host?: string
  sslEnabled?: boolean
  cacheSettings?: CacheSettings
}

/** Handle returned by `getSqlConnect`. Treat it as opaque. */
export type SqlConnect = {
  readonly key: string
  readonly config: ConnectorConfig
  readonly appName: string
  readonly settings: SqlConnectSettings
}

export type ExecuteQueryOptions = {
  fetchPolicy?: QueryFetchPolicy
}

export type QueryResult<Data> = {
  data: Data
  source: DataSource
}

export type MutationResult<Data> = {
  data: Data
}

export type SubscriptionObserver<Data> = {
  next?: (result: QueryResult<Data>) => void
  error?: (error: Error) => void
}

export type Unsubscribe = () => void

/** JSON value, used for variables and for untyped results. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * Operation variables.
 *
 * Deliberately `object` and not `Record<string, unknown>`: a TypeScript
 * `interface` has no index signature, so a generated `XxxVariables` interface
 * fails to satisfy a Record constraint. The shape is checked at runtime in
 * `serializeVariables` instead.
 */
export type Variables = object | undefined
