import { TurboModuleRegistry, type TurboModule } from 'react-native'
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes'

/**
 * Payload pushed from native for every subscription update.
 *
 * `payloadJson` is a JSON document shaped like one of:
 *   { "data": <object>, "source": "cache" | "server" }
 *   { "error": { "code": string, "message": string, "graphQLErrors": [...], "partialData": <object|null> } }
 *
 * It is carried as a string on purpose. Data Connect encodes Int64, UUID, Date
 * and Timestamp as strings, and routing those through a bridge map risks having
 * them coerced into doubles.
 */
export type QueryEvent = {
  subId: string
  payloadJson: string
}

export interface Spec extends TurboModule {
  /**
   * Creates the native Data Connect instance for `instanceKey` if it does not
   * exist yet. Safe to call repeatedly with identical arguments.
   *
   * `settingsJson` accepts { host?, sslEnabled?, cacheStorage?, cacheMaxAgeSeconds? }.
   * Settings only apply the first time an instance is created, matching the
   * behaviour of both native SDKs.
   */
  configure(
    instanceKey: string,
    appName: string,
    connector: string,
    location: string,
    serviceId: string,
    settingsJson: string | null,
  ): Promise<void>

  /** Points the instance at a local emulator. Must run before any operation. */
  useEmulator(instanceKey: string, host: string, port: number): Promise<void>

  /** Runs a query. `fetchPolicy` is one of PREFER_CACHE, CACHE_ONLY, SERVER_ONLY. */
  executeQuery(
    instanceKey: string,
    operationName: string,
    variablesJson: string,
    fetchPolicy: string,
  ): Promise<string>

  /** Runs a mutation. Mutations never read from the cache. */
  executeMutation(instanceKey: string, operationName: string, variablesJson: string): Promise<string>

  /** Starts a realtime subscription that reports through `onQueryEvent`. */
  subscribe(
    instanceKey: string,
    subId: string,
    operationName: string,
    variablesJson: string,
  ): Promise<void>

  /** Stops a subscription. Unknown ids resolve without error. */
  unsubscribe(subId: string): Promise<void>

  /** Closes the native instance and cancels its subscriptions. */
  terminate(instanceKey: string): Promise<void>

  /**
   * Deletes every Data Connect cache file this app has on disk and resolves with
   * the number of files removed. App-wide, not per instance: neither SDK offers a
   * documented way to address one connector's cache.
   */
  clearCache(): Promise<number>

  /**
   * Returns JSON diagnostics: instance count, live subscription ids, whether a
   * Firebase user is signed in, and whether App Check is configured. Meant for
   * troubleshooting `unauthorized` responses and leak hunting in tests.
   */
  getDiagnostics(instanceKey: string): Promise<string>

  readonly onQueryEvent: EventEmitter<QueryEvent>
}

export default TurboModuleRegistry.getEnforcing<Spec>('RnSqlConnect')
