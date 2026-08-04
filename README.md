# rn-sql-connect

React Native SDK for **Firebase SQL Connect** (Data Connect) built on the **native** Android and Apple SDKs, not on the JavaScript web SDK.

> Status: pre-release, **working end to end on both platforms**: 9 of 9 smoke steps pass on an Android emulator and an iOS simulator against the Data Connect emulator. See [Verification status](#verification-status).

## Why

Running `firebase/data-connect` inside React Native works, but it costs you:

| With the web SDK in RN | With rn-sql-connect |
| --- | --- |
| A second Firebase JS app next to `@react-native-firebase` | One Firebase app |
| A custom-token bridge so `@auth(USER)` operations have an identity | Auth token attached automatically by the native SDK |
| An App Check `CustomProvider` relaying the native token | App Check token attached automatically |
| In-memory cache only, no expiry | Persistent cache with `maxAge` and three fetch policies |
| `firebase` in your JS bundle | No JS Firebase dependency |

## Requirements

| Requirement | Minimum | Why |
| --- | --- | --- |
| React Native | **0.85** | `spm_dependency` and stable codegen event emitters |
| Architecture | **New Architecture** | This package ships a TurboModule only |
| `@react-native-firebase/app` | **26.1.0** | First version that resolves Firebase through SPM |
| iOS Podfile | `$RNFirebaseDisableSPM = true` | See below |
| iOS deployment target | 15.0 | Required by `data-connect-ios-sdk` |
| Android `minSdk` | 23 | Required by Firebase BoM 34 |
| firebase-tools (codegen only) | 15.14.0 | Realtime-capable SDK generation |

**iOS needs react-native-firebase in CocoaPods mode.** `FirebaseDataConnect` is distributed through Swift Package Manager only, and SwiftPM links a private copy of `FirebaseCore` into every framework that depends on it, which would leave Data Connect unable to see the Firebase instance react-native-firebase configured. So the Apple SDK is vendored into this package and Firebase comes from CocoaPods, the same copy react-native-firebase uses. The podspec refuses to install if that is not the case. Full reasoning in [docs/ios-spm.md](docs/ios-spm.md), confirmed upstream in [#9140](https://github.com/invertase/react-native-firebase/issues/9140).

## Install

```sh
npm install rn-sql-connect
cd ios && pod install
```

```ruby
# ios/Podfile, before any target block
$RNFirebaseDisableSPM = true
$RNFirebaseAsStaticFramework = true
```

On Apple platforms, call `FirebaseApp.configure()` in your `AppDelegate` as react-native-firebase requires. Without it every call fails with `not-configured`.

## Usage

```ts
import { getSqlConnect, executeQuery, executeMutation, subscribe, QueryFetchPolicy } from 'rn-sql-connect'

const dc = getSqlConnect(
  { connector: 'example', location: 'asia-southeast1', serviceId: 'example' },
  { cacheSettings: { storage: 'persistent', maxAge: '5m' } },
)

// One shot
const { data, source } = await executeQuery<ListMoviesData>(dc, 'ListMoviesByGenre', { genre: 'Sci-Fi' })
console.log(source) // 'cache' or 'server'

// Never serve a stale read
await executeQuery(dc, 'GetConfig', undefined, { fetchPolicy: QueryFetchPolicy.SERVER_ONLY })

// Mutation
await executeMutation(dc, 'CreateMovie', { title: 'Dune', genre: 'Sci-Fi' })

// Realtime
const unsubscribe = subscribe(dc, 'GetMovieById', { id }, {
  next: result => setMovie(result.data.movie),
  error: error => console.warn(error.code, error.message),
})
```

React hook:

```tsx
import { useSqlConnectQuery } from 'rn-sql-connect/react'

const { data, loading, error, source, refetch } = useSqlConnectQuery(dc, 'ListMoviesByGenre', { genre: 'Sci-Fi' }, {
  subscribe: true,
})
```

### Cache policy, and one trap worth knowing

`maxAge` defaults to `0`, which means responses are cached but every `PREFER_CACHE` call still revalidates against the server. Raising `maxAge` is what makes cached reads actually serve. So:

- A screen where stale data is only a cosmetic delay: raise `maxAge`.
- Anything where a stale read is a bug (feature flags, config versions, balances): pass `SERVER_ONLY` explicitly. Do not rely on `maxAge` staying `0` forever.

### Auth and App Check

Nothing to wire up. The native SDKs read the current user and the App Check token from the same `FirebaseApp`. `@auth(USER)` operations work as soon as the user is signed in through `@react-native-firebase/auth`.

If a `USER` operation returns `unauthorized`, check what native sees:

```ts
import { getDiagnostics } from 'rn-sql-connect'
console.log(await getDiagnostics(dc)) // { hasCurrentUser, uid, appCheckConfigured, activeSubscriptions, ... }
```

### Emulator

```ts
import { connectSqlConnectEmulator } from 'rn-sql-connect'
connectSqlConnectEmulator(dc, { port: 9399 }) // must run before the first operation
```

```sh
firebase emulators:start --only dataconnect,auth
```

## Typed SDK generation

```sh
npx rn-sql-connect-codegen --in vendor/dataconnect-generated/example --out src/dataconnect/example
```

The generator reads the JavaScript SDK produced by `firebase dataconnect:sdk:generate` and emits TypeScript wrappers with **the same function names**, so migrating a call site is only a change of import path:

```diff
-import { listMoviesByGenre } from '@dataconnect/example'
+import { listMoviesByGenre } from '@/src/dataconnect/example'
```

Every query also gets a `subscribeXxx` helper. The emitted code has no dependency on the `firebase` package, and the generator refuses to emit anything that still references web SDK types.

## Realtime requirements

`subscribe()` only pushes updates when the server is able to signal a refresh:

- Single entity lookups by primary key get refresh signals implicitly.
- Anything else (lists, filtered queries) needs `@refresh(onMutationExecuted: ...)` on the operation, with a CEL condition narrow enough to avoid refreshing on unrelated writes.

Operations live on the server, so this is a schema change, not a client change.

## Error handling

```ts
import { SqlConnectError } from 'rn-sql-connect'

try {
  await executeQuery(dc, 'GetProfile')
} catch (error) {
  if (error instanceof SqlConnectError) {
    error.code // 'unauthenticated' | 'unauthorized' | 'not-found' | 'invalid-argument'
               // | 'partial-error' | 'unavailable' | 'cancelled' | 'not-configured'
               // | 'internal' | 'unknown'
    error.graphQLErrors // [{ message, path }]
    error.partialData   // set when code === 'partial-error'
    error.nativeCode    // original platform error, for bug reports
  }
}
```

`partial-error` means the server returned data **and** errors. Whether that partial data is usable is your call, so it is surfaced rather than silently dropped.

## Debugging

```ts
globalThis.RNSqlConnectDebug = true // logs every native call and its result
```

## Verification status

| Layer | State |
| --- | --- |
| JavaScript core, hook, error mapping, subscription dedupe | Unit tested (67 tests) |
| Code generator | Unit tested, plus generated from three real connectors (6, 55 and 96 operations) and compiled |
| Android Kotlin | **9 of 9 smoke steps pass** on an Android emulator against the Data Connect emulator |
| iOS Swift and TurboModule shim | **9 of 9 smoke steps pass** on an iOS simulator, with the Apple SDK vendored and Firebase from CocoaPods |

Each smoke run covers a mutation, a server read, an on-disk cache read, a realtime subscription reacting to a mutation, Int64 and UUID fidelity, a nested `Any` scalar containing a null, native diagnostics, and error-code mapping.

See [docs/local-testing.md](docs/local-testing.md) for how to reproduce any of this in a few minutes.

On iOS the Apple Data Connect SDK is vendored rather than pulled through Swift Package Manager, because SwiftPM would give this package a private copy of `FirebaseCore` and Data Connect would never see the signed-in user. That is an upstream packaging property, confirmed in [#9140](https://github.com/invertase/react-native-firebase/issues/9140). The vendored copy is pinned and CI fails if it drifts (`npm run vendor:check`).

## License

Apache-2.0
