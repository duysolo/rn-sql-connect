export {
  connectSqlConnectEmulator,
  getDiagnostics,
  getSqlConnect,
  terminate,
  type Diagnostics,
  type EmulatorOptions,
} from './core/instance'
export { clearCache } from './core/cache'
export { executeMutation, executeQuery } from './core/operations'
export { activeSubscriptionCount, subscribe } from './core/subscriptions'
export { durationToSeconds } from './core/duration'
export {
  SqlConnectError,
  type GraphQLErrorInfo,
  type SqlConnectErrorCode,
} from './core/errors'
export {
  QueryFetchPolicy,
  type CacheSettings,
  type CacheStorage,
  type ConnectorConfig,
  type DataSource,
  type Duration,
  type ExecuteQueryOptions,
  type JsonValue,
  type MutationResult,
  type QueryResult,
  type SqlConnect,
  type SqlConnectSettings,
  type SubscriptionObserver,
  type Unsubscribe,
  type Variables,
} from './core/types'
