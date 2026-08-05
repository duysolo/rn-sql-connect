import type { QueryEvent, Spec } from '../specs/NativeRnSqlConnect'

type Listener = (event: QueryEvent) => void

export type NativeMock = Spec & {
  __calls: { method: string; args: unknown[] }[]
  /** What `clearCache` should report back. */
  __filesRemoved?: number
  __emit: (event: QueryEvent) => void
  __listenerCount: () => number
  __queryResults: Map<string, string>
  __failNext?: { code: string; message: string; details?: string }
}

/**
 * Stand-in for the TurboModule.
 *
 * Mirrors the real contract closely: JSON strings in and out, promise
 * rejections carrying `code` and `userInfo.details`, and an event emitter whose
 * subscription can be removed. Tests that pass against this mock exercise the
 * same code paths the device does.
 */
export const createNativeMock = (): NativeMock => {
  const listeners = new Set<Listener>()
  const calls: { method: string; args: unknown[] }[] = []
  const queryResults = new Map<string, string>()

  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args })
  }

  const maybeFail = (mock: NativeMock) => {
    if (!mock.__failNext) {
      return undefined
    }
    const failure = mock.__failNext
    mock.__failNext = undefined
    const error = Object.assign(new Error(failure.message), {
      code: failure.code,
      userInfo: { details: failure.details ?? '' },
    })
    return Promise.reject(error)
  }

  const mock: NativeMock = {
    __calls: calls,
    __queryResults: queryResults,
    __emit: event => {
      listeners.forEach(listener => listener(event))
    },
    __listenerCount: () => listeners.size,

    configure: (...args) => {
      record('configure', args)
      return maybeFail(mock) ?? Promise.resolve()
    },
    useEmulator: (...args) => {
      record('useEmulator', args)
      return Promise.resolve()
    },
    executeQuery: (...args) => {
      record('executeQuery', args)
      const failure = maybeFail(mock)
      if (failure) {
        return failure
      }
      const operationName = args[1] as string
      return Promise.resolve(
        queryResults.get(operationName) ?? JSON.stringify({ data: { ok: true }, source: 'server' }),
      )
    },
    executeMutation: (...args) => {
      record('executeMutation', args)
      const failure = maybeFail(mock)
      if (failure) {
        return failure
      }
      const operationName = args[1] as string
      return Promise.resolve(
        queryResults.get(operationName) ?? JSON.stringify({ data: { ok: true }, source: 'server' }),
      )
    },
    subscribe: (...args) => {
      record('subscribe', args)
      return maybeFail(mock) ?? Promise.resolve()
    },
    unsubscribe: (...args) => {
      record('unsubscribe', args)
      return Promise.resolve()
    },
    terminate: (...args) => {
      record('terminate', args)
      return Promise.resolve()
    },
    clearCache: (...args) => {
      record('clearCache', args)
      return maybeFail(mock) ?? Promise.resolve(mock.__filesRemoved ?? 0)
    },
    getDiagnostics: (...args) => {
      record('getDiagnostics', args)
      return Promise.resolve(
        JSON.stringify({
          instanceKey: args[0],
          configured: true,
          activeSubscriptions: 0,
          subscriptionIds: [],
          hasCurrentUser: false,
          appCheckConfigured: true,
        }),
      )
    },
    onQueryEvent: ((listener: Listener) => {
      listeners.add(listener)
      return {
        remove: () => {
          listeners.delete(listener)
        },
      }
    }) as Spec['onQueryEvent'],
  } as NativeMock

  return mock
}
