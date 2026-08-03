import { durationToSeconds } from './duration'
import { SqlConnectError, errorFromRejection } from './errors'
import { getNativeModule } from './native'
import type { ConnectorConfig, SqlConnect, SqlConnectSettings } from './types'

const DEFAULT_APP_NAME = '[DEFAULT]'

type InstanceState = {
  handle: SqlConnect
  /** Cached so concurrent first calls configure the native side exactly once. */
  configured?: Promise<void>
  /** Set once any operation ran, to reject a late `connectSqlConnectEmulator`. */
  used: boolean
  emulator?: { host: string; port: number }
}

const instances = new Map<string, InstanceState>()

const instanceKeyOf = (appName: string, config: ConnectorConfig): string =>
  [appName, config.serviceId, config.location, config.connector].join('|')

const assertConfig = (config: ConnectorConfig): void => {
  for (const field of ['connector', 'location', 'serviceId'] as const) {
    if (typeof config?.[field] !== 'string' || config[field].length === 0) {
      throw new TypeError(`getSqlConnect: connector config is missing "${field}"`)
    }
  }
}

const settingsToJson = (settings: SqlConnectSettings): string | null => {
  const payload: Record<string, unknown> = {}
  if (settings.host !== undefined) {
    payload.host = settings.host
  }
  if (settings.sslEnabled !== undefined) {
    payload.sslEnabled = settings.sslEnabled
  }
  if (settings.cacheSettings) {
    if (settings.cacheSettings.storage !== undefined) {
      payload.cacheStorage = settings.cacheSettings.storage
    }
    if (settings.cacheSettings.maxAge !== undefined) {
      payload.cacheMaxAgeSeconds = durationToSeconds(settings.cacheSettings.maxAge)
    }
  }
  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null
}

const sameSettings = (a: SqlConnectSettings, b: SqlConnectSettings): boolean =>
  settingsToJson(a) === settingsToJson(b)

/**
 * Returns the handle for a connector, creating it on first use.
 *
 * Instances are keyed by (app, serviceId, location, connector), the same
 * identity both native SDKs use. Settings are locked in at creation time
 * because neither SDK lets you change them afterwards, so asking for the same
 * connector with different settings throws instead of silently ignoring them.
 */
export const getSqlConnect = (
  config: ConnectorConfig,
  settings: SqlConnectSettings = {},
): SqlConnect => {
  assertConfig(config)
  const appName = settings.appName ?? DEFAULT_APP_NAME
  const key = instanceKeyOf(appName, config)
  const existing = instances.get(key)

  if (existing) {
    if (!sameSettings(existing.handle.settings, settings)) {
      throw new SqlConnectError({
        code: 'invalid-argument',
        message:
          `getSqlConnect was called again for connector "${config.connector}" with different ` +
          'settings. Data Connect locks settings when the instance is created; call terminate() ' +
          'first if you really need to rebuild it.',
      })
    }
    return existing.handle
  }

  const handle: SqlConnect = Object.freeze({
    key,
    config: Object.freeze({ ...config }),
    appName,
    settings: Object.freeze({ ...settings }),
  })
  instances.set(key, { handle, used: false })
  return handle
}

const stateOf = (instance: SqlConnect): InstanceState => {
  const state = instances.get(instance.key)
  if (!state) {
    throw new SqlConnectError({
      code: 'not-configured',
      message: 'This SqlConnect handle was terminated. Call getSqlConnect() again.',
    })
  }
  return state
}

/**
 * Makes sure the native instance exists before an operation runs.
 *
 * The emulator switch is applied inside the same cached promise so that it can
 * never race with the first query, which both native SDKs reject.
 */
export const ensureConfigured = async (instance: SqlConnect): Promise<void> => {
  const state = stateOf(instance)
  if (!state.configured) {
    const native = getNativeModule()
    state.configured = (async () => {
      await native.configure(
        instance.key,
        instance.appName,
        instance.config.connector,
        instance.config.location,
        instance.config.serviceId,
        settingsToJson(instance.settings),
      )
      if (state.emulator) {
        await native.useEmulator(instance.key, state.emulator.host, state.emulator.port)
      }
    })().catch(error => {
      // Let the next call retry instead of caching a failure forever.
      state.configured = undefined
      throw errorFromRejection(error)
    })
  }
  await state.configured
  state.used = true
}

export type EmulatorOptions = {
  /** Defaults to 10.0.2.2 on Android and 127.0.0.1 elsewhere, as the SDKs do. */
  host?: string
  port?: number
}

/**
 * Points an instance at a local Data Connect emulator.
 *
 * Must run before the first query or mutation. Native throws if it arrives
 * late, so this fails fast in JS with a clearer message.
 */
export const connectSqlConnectEmulator = (
  instance: SqlConnect,
  options: EmulatorOptions = {},
): void => {
  const state = stateOf(instance)
  if (state.used) {
    throw new SqlConnectError({
      code: 'invalid-argument',
      message:
        'connectSqlConnectEmulator must be called before any query or mutation runs on this ' +
        'instance.',
    })
  }
  state.emulator = {
    host: options.host ?? '',
    port: options.port ?? 9399,
  }
}

/** Closes the native instance and forgets the handle. Mostly for tests and sign-out. */
export const terminate = async (instance: SqlConnect): Promise<void> => {
  const state = instances.get(instance.key)
  if (!state) {
    return
  }
  instances.delete(instance.key)
  if (!state.configured) {
    return
  }
  try {
    await getNativeModule().terminate(instance.key)
  } catch (error) {
    throw errorFromRejection(error)
  }
}

export type Diagnostics = {
  instanceKey: string
  configured: boolean
  activeSubscriptions: number
  subscriptionIds: string[]
  hasCurrentUser: boolean
  uid?: string
  appCheckConfigured: boolean
}

/**
 * Native-side diagnostics.
 *
 * Two questions this answers quickly: why a `@auth(USER)` operation returns
 * `unauthorized` (no signed-in user on the Firebase app this instance runs
 * under), and whether subscriptions are leaking across reloads.
 */
export const getDiagnostics = async (instance: SqlConnect): Promise<Diagnostics> => {
  try {
    const raw = await getNativeModule().getDiagnostics(instance.key)
    return JSON.parse(raw) as Diagnostics
  } catch (error) {
    throw errorFromRejection(error)
  }
}

/** Test seam. Drops JS-side bookkeeping without touching native. */
export const resetInstancesForTests = (): void => {
  instances.clear()
}
