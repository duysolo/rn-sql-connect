import NativeRnSqlConnect, { type Spec } from '../specs/NativeRnSqlConnect'

declare const globalThis: { RNSqlConnectDebug?: boolean } & Record<string, unknown>

const LINKING_ERROR =
  "The native module 'RnSqlConnect' could not be found.\n\n" +
  '- iOS: add `$RNFirebaseDisableSPM = true` to the Podfile, then run `pod install` in the ios ' +
  'directory and rebuild. Static linkage is fine and is what this package is tested with; see ' +
  'docs/internals/ios-architecture.md.\n' +
  '- Android: rebuild the app after installing the package.\n' +
  '- Both: this package requires the New Architecture and does not work in Expo Go.\n' +
  '- Running a JS bundle against an older native binary produces this too. Rebuild the app.'

let cached: Spec | undefined

/**
 * Returns the TurboModule, with a logging proxy when `globalThis.RNSqlConnectDebug`
 * is on. Every call and settlement is printed, which is the fastest way to tell
 * a JS-side bug from a native-side one.
 */
export const getNativeModule = (): Spec => {
  if (cached) {
    return cached
  }
  if (!NativeRnSqlConnect) {
    throw new Error(LINKING_ERROR)
  }
  if (!globalThis.RNSqlConnectDebug) {
    cached = NativeRnSqlConnect
    return cached
  }

  cached = new Proxy(NativeRnSqlConnect, {
    get: (target, property, receiver) => {
      const value = Reflect.get(target, property, receiver) as unknown
      if (typeof value !== 'function') {
        return value
      }
      const name = String(property)
      return (...args: unknown[]) => {
        // eslint-disable-next-line no-console
        console.debug(`[rn-sql-connect ->] ${name}`, args)
        const result = (value as (...callArgs: unknown[]) => unknown).apply(target, args)
        if (result instanceof Promise) {
          return result.then(
            resolved => {
              // eslint-disable-next-line no-console
              console.debug(`[rn-sql-connect <-] ${name}`, resolved)
              return resolved
            },
            rejected => {
              // eslint-disable-next-line no-console
              console.debug(`[rn-sql-connect <x] ${name}`, rejected)
              throw rejected
            },
          )
        }
        return result
      }
    },
  }) as Spec

  return cached
}

/** Test seam. Also resets the debug proxy after toggling the debug flag. */
export const resetNativeModuleCache = (): void => {
  cached = undefined
}
