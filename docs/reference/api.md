# API reference

Everything exported from `rn-sql-connect` and `rn-sql-connect/react`. The API is modular, in the style of `@react-native-firebase` v22 and later: free functions taking an instance, no namespaces.


| Group | Exports |
| --- | --- |
| Instances | [`getSqlConnect`](#getsqlconnectconfig-settings), [`connectSqlConnectEmulator`](#connectsqlconnectemulatorinstance-options), [`terminate`](#terminateinstance), [`clearCache`](#clearcache), [`getDiagnostics`](#getdiagnosticsinstance) |
| Operations | [`executeQuery`](#executequeryinstance-operationname-variables-options), [`executeMutation`](#executemutationinstance-operationname-variables), [variables](#variables) |
| Caching | [`cacheSettings`](#caching), [the `maxAge` trap](#the-trap-in-maxage), [fetch policies](#fetch-policies) |
| Realtime | [`subscribe`](#subscribeinstance-operationname-variables-observer), [server-side requirements](#server-side-requirements) |
| Errors | [`SqlConnectError` and every code](#errors) |
| React | [`useSqlConnectQuery`](#react) |
| Reference | [types](#type-reference), [how values cross the bridge](#how-values-cross-the-bridge) |

## Instances

### `getSqlConnect(config, settings?)`

```ts
const dc = getSqlConnect(
  { connector: 'example', location: 'asia-southeast1', serviceId: 'example' },
  { cacheSettings: { storage: 'persistent', maxAge: '5m' } },
)
```

| Parameter | Type | Notes |
| --- | --- | --- |
| `config.connector` | `string` | required |
| `config.location` | `string` | required, e.g. `asia-southeast1` |
| `config.serviceId` | `string` | required |
| `settings.appName` | `string` | Firebase app to use, defaults to `[DEFAULT]` |
| `settings.host` | `string` | override the backend host |
| `settings.sslEnabled` | `boolean` | |
| `settings.cacheSettings` | `CacheSettings` | see [caching](#caching) |

Returns an opaque `SqlConnect` handle. Instances are keyed by `(app, serviceId, location, connector)`, the same identity the native SDKs use, so calling it twice with the same connector returns the same handle. Two different connectors in one app are fine and independent.

Nothing happens on the network here. The native instance is created lazily on the first operation, and concurrent first calls configure it exactly once.

**Settings are locked at creation.** Neither native SDK lets you change them afterwards, so calling `getSqlConnect` again for the same connector with different settings throws rather than silently ignoring them. Call `terminate` first if you really need to rebuild it.

### `connectSqlConnectEmulator(instance, options?)`

```ts
connectSqlConnectEmulator(dc, { port: 9399 })
connectSqlConnectEmulator(dc, { host: '192.168.1.20', port: 9399 })  // physical device
```

Must run before the first query or mutation. Throws `SqlConnectError` with code `invalid-argument` if an operation already started, including one still in flight, because native cannot switch after that point.

Leave `host` unset to get each platform's own default: `10.0.2.2` on Android, `127.0.0.1` elsewhere. That is the correct mapping for the Android emulator and the iOS simulator respectively.

### `terminate(instance)`

```ts
await terminate(dc)
```

Closes the native instance, cancels its subscriptions, and forgets the handle. A handle that was never used resolves without touching native.

Using a handle after terminating it throws `not-configured`.

**It does not clear the cache.** With `storage: 'persistent'` the cached responses stay on disk and survive an app restart. Use [`clearCache()`](#clearcache) for that. See [after sign-out](../guides/05-auth.md#after-sign-out-the-cache-is-still-there).

### `clearCache()`

```ts
import { clearCache } from 'rn-sql-connect'

await signOut(getAuth())
const filesRemoved = await clearCache()
```

Deletes every Data Connect cache file this app has on disk. Resolves with the number of files removed; rejects with `SqlConnectError` (`internal`) if the platform refused a deletion, because "could not clear" must not read the same as "nothing to clear".

**App-wide, not per instance.** It takes no argument on purpose:

- Apple names each cache file after a hash of the connector config plus a hash of the signed-in uid. Reproducing that recipe to delete one slice would depend on an internal detail with no stability promise, and the day it changes the deletion would silently stop matching anything. So everything under `<Documents>/com.google.firebase.dataconnect` goes.
- Android keeps one database for the app and scopes rows by uid inside it, so there is no per-user file to single out.

**Call it after signing out.** That is when the Apple SDK closes the cache file it holds.

**The files go immediately; the current process may not notice until it restarts.** Measured on a device, populating a cache then clearing it:

| | files removed | a `CACHE_ONLY` read straight afterwards |
| --- | --- | --- |
| iOS | 3, second call `0` | misses, code `cache-miss` |
| Android | 3, second call `0` | **still served**, `source: 'cache'` |

Android's open SQLite handle keeps reading the unlinked file until the process exits. On disk the outcome is the same on both - the databases directory is empty - and that is what this function promises. If a read has to miss *now* rather than after the next launch, use `SERVER_ONLY` for it instead of relying on the wipe.

Handles stay valid. There is no need to `terminate()` first or to rebuild anything afterwards - the SDK recreates what it needs on the next query. Running it twice, or on a fresh install, reports `0` rather than failing.

### `getDiagnostics(instance)`

```ts
const diagnostics = await getDiagnostics(dc)
```

```ts
type Diagnostics = {
  instanceKey: string
  configured: boolean
  activeSubscriptions: number
  subscriptionIds: string[]
  hasCurrentUser: boolean
  uid?: string | null
  appCheckConfigured: boolean
}
```

Reports what the **native** side sees, which is the point: it answers questions JavaScript cannot.

- A `USER`-level operation failing with `unauthenticated` and `hasCurrentUser: false` means the sign-in never reached the Firebase app this instance uses.
- The same failure with `hasCurrentUser: true` and the right uid means the server refused the call, so the `@auth` rule is the thing to look at, not the client.
- `activeSubscriptions` should return to zero after unsubscribing. If it does not, subscriptions are leaking across reloads.

## Operations

### `executeQuery(instance, operationName, variables?, options?)`

```ts
const result = await executeQuery<ListMoviesData, ListMoviesVariables>(
  dc,
  'ListMoviesByGenre',
  { genre: 'Sci-Fi' },
  { fetchPolicy: QueryFetchPolicy.SERVER_ONLY },
)

result.data    // ListMoviesData
result.source  // 'cache' | 'server'
```

`source` is worth checking whenever a stale read would be a bug. A cached result is indistinguishable from a fresh one at the call site otherwise.

Both type parameters are optional and default to `unknown`. Generated wrappers fill them in for you.

### `executeMutation(instance, operationName, variables?)`

```ts
const result = await executeMutation<CreateMovieData>(dc, 'CreateMovie', {
  title: 'Dune',
  genre: 'Sci-Fi',
})
result.data
```

Mutations never read from the cache.

### Variables

Variables are a plain object, serialised to JSON for the bridge.

`undefined` properties are **dropped**, `null` properties are **kept**. In GraphQL those mean different things: dropping means "leave this argument out", null means "set this to null", and Data Connect mutations act on the difference.

```ts
await executeMutation(dc, 'UpdateProfile', {
  displayName: 'A',
  photoUrl: null,       // clears the column
  bio: undefined,       // leaves the column alone
})
```

## Caching

```ts
const dc = getSqlConnect(config, {
  cacheSettings: { storage: 'persistent', maxAge: '5m' },
})
```

| Field | Values | Default |
| --- | --- | --- |
| `storage` | `'persistent'` on disk, `'memory'` | `'persistent'` |
| `maxAge` | seconds, or `'30s'`, `'5m'`, `'1h30m'` | `0` |

`maxAge` accepts the same syntax as `connector.yaml`, so a policy can be copied between the two without translating units.

`persistent` means on disk and across app restarts. Nothing clears it automatically, not even `terminate` or signing out, so treat it as a device-level cache when deciding what to put behind it.

### The trap in `maxAge`

The default is `0`, which means responses are cached but every `PREFER_CACHE` call still revalidates against the server. Cached values are only served once `maxAge` is raised, or when the caller asks for `CACHE_ONLY`.

So:

- Screens where stale data is a cosmetic delay: raise `maxAge`.
- Anything where a stale read is a bug (feature flags, config versions, balances): pass `SERVER_ONLY` explicitly. Do not rely on `maxAge` staying `0`, because someone will raise it later for a different screen.

### Fetch policies

```ts
import { QueryFetchPolicy } from 'rn-sql-connect'
```

| Policy | Behaviour |
| --- | --- |
| `PREFER_CACHE` | default. Serves cache if it is younger than `maxAge`, otherwise revalidates |
| `CACHE_ONLY` | never touches the network. Returns whatever is cached, however old |
| `SERVER_ONLY` | always fetches, then refreshes the cache |

## Realtime

### `subscribe(instance, operationName, variables?, observer?)`

```ts
const unsubscribe = subscribe<GetMovieData>(dc, 'GetMovieById', { id }, {
  next: result => setMovie(result.data.movie),
  error: error => console.warn(error.code, error.message),
})

// later
unsubscribe()
```

Returns an `Unsubscribe` function. Calling it twice is safe.

Behaviour worth knowing:

- **Callers sharing a query share one native subscription.** Equal variables mean the same subscription, regardless of key order in the object, so mounting the same screen twice does not double the server-side cost. The native stream is cancelled when the last observer detaches.
- **A late joiner gets the latest value immediately**, rather than waiting for the next push.
- Everything is torn down when the React instance goes away, so a Fast Refresh does not leak gRPC streams. `activeSubscriptionCount()` and `getDiagnostics` both let you assert that in tests.

### Server-side requirements

`subscribe()` only receives updates when the server can signal a refresh:

- A query that looks up a single entity by primary key gets refresh signals implicitly.
- Anything else, including lists and filtered queries, needs `@refresh(onMutationExecuted: ...)` on the operation, ideally with a CEL condition narrow enough to avoid refreshing on unrelated writes.

Operations live on the server, so this is a schema change, not a client change. A subscription without it simply never pushes.

## Errors

Every failure is a `SqlConnectError`:

```ts
import { SqlConnectError } from 'rn-sql-connect'

try {
  await executeQuery(dc, 'GetProfile')
} catch (error) {
  if (error instanceof SqlConnectError) {
    error.code            // see the table below
    error.operationName   // which call failed
    error.graphQLErrors   // [{ message, path }]
    error.partialData     // set when code is 'partial-error'
    error.nativeCode      // the original platform error, for bug reports
  }
}
```

| Code | Meaning |
| --- | --- |
| `unauthenticated` | no signed-in user, or the token was rejected |
| `unauthorized` | signed in, but the `@auth` rule refused the call |
| `not-found` | unknown operation, or a lookup found nothing the schema requires |
| `invalid-argument` | bad variables, or an API misuse this package caught first |
| `partial-error` | the server returned data **and** errors |
| `unavailable` | network or backend unreachable, including timeouts |
| `cancelled` | the call was cancelled |
| `not-configured` | Firebase is not configured, or the handle was terminated |
| `internal` | anything else the platform reported |
| `unknown` | a failure with no recognisable shape |

Android throws a tree of exceptions and Apple platforms expose four unrelated structs, so neither taxonomy maps onto the other directly. Both sides normalise into this list and keep the original in `nativeCode`. gRPC status codes are read directly rather than matched from message text, so both platforms agree on the code for the same failure.

`partial-error` is surfaced as an error rather than silently dropped, because whether partial data is usable is the caller's decision, not this package's.

## React

```ts
import { useSqlConnectQuery } from 'rn-sql-connect/react'

const { data, error, loading, source, refetch } = useSqlConnectQuery(
  dc,
  'ListMoviesByGenre',
  { genre: 'Sci-Fi' },
  { subscribe: true, fetchPolicy: 'PREFER_CACHE', skip: false },
)
```

| Option | Effect |
| --- | --- |
| `subscribe` | keeps the result live instead of fetching once |
| `skip` | skips the query, for screens waiting on something else |
| `fetchPolicy` | as above |

Variables are compared by value, so you do not have to memoise the object literal you pass in.

This hook is deliberately small: no global cache, no request dedupe beyond what the native SDK already does. Apps with their own data layer should call `executeQuery` from it rather than adopt this.

## Utilities

| Export | Purpose |
| --- | --- |
| `durationToSeconds(value)` | parses `'5m'` and friends, the same parser `cacheSettings.maxAge` uses |
| `activeSubscriptionCount()` | live native subscriptions, for leak assertions in tests |
| `globalThis.RNSqlConnectDebug = true` | logs every native call and its result |

## Type reference

```ts
type ConnectorConfig = { connector: string; location: string; serviceId: string }
type SqlConnectSettings = {
  appName?: string
  host?: string
  sslEnabled?: boolean
  cacheSettings?: CacheSettings
}
type CacheSettings = { storage?: 'persistent' | 'memory'; maxAge?: number | string }
type QueryResult<Data> = { data: Data; source: 'cache' | 'server' }
type MutationResult<Data> = { data: Data }
type SubscriptionObserver<Data> = {
  next?: (result: QueryResult<Data>) => void
  error?: (error: Error) => void
}
type Unsubscribe = () => void
```

## How values cross the bridge

Results travel as JSON text, not as a bridge map, because Data Connect encodes several types as strings and a map round trip risks coercing them.

| Data Connect type | JavaScript |
| --- | --- |
| `String`, `Int`, `Float`, `Boolean` | `string`, `number`, `number`, `boolean` |
| `UUID` | `string`, unchanged, not parsed |
| `Int64` | **`string`** |
| `Date` | `string`, `YYYY-MM-DD` |
| `Timestamp` | `string`, RFC 3339. The server normalises the format, so compare instants rather than text |
| `Any` | any JSON value |
| lists | arrays of the above |

`Int64` as a string is the important one. `9007199254740993` cannot be represented as a JavaScript number, and a bridge that converts it silently returns `9007199254740992`. That case is covered by a test on both platforms.

---

See also: [Error codes](error-codes.md) | [Data types](data-types.md) | [Configuration](configuration.md)
