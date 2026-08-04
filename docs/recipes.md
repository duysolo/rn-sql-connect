# Recipes

Patterns that come up in a real app, and the reasoning behind each one.

- [Choosing a fetch policy](#choosing-a-fetch-policy)
- [Realtime that actually pushes](#realtime-that-actually-pushes)
- [Auth](#auth)
- [Error handling](#error-handling)
- [Multiple connectors](#multiple-connectors)
- [A secondary Firebase app](#a-secondary-firebase-app)
- [Migrating off the JavaScript web SDK](#migrating-off-the-javascript-web-sdk)
- [Testing app code that uses this package](#testing-app-code-that-uses-this-package)
- [Things this package will not do for you](#things-this-package-will-not-do-for-you)

## Choosing a fetch policy

The decision is not about performance, it is about what a stale read costs.

```ts
// Config, feature flags, versions: a stale read is a bug.
await executeQuery(dc, 'GetAppConfig', undefined, {
  fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
})

// A list the user just pulled to refresh: they asked for fresh.
await executeQuery(dc, 'ListArticles', vars, {
  fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
})

// Reopening a screen the user saw a minute ago: cache is fine.
await executeQuery(dc, 'GetArticle', { id })   // PREFER_CACHE

// Offline first paint: show something, then refresh.
const cached = await executeQuery(dc, 'ListArticles', vars, {
  fetchPolicy: QueryFetchPolicy.CACHE_ONLY,
})
```

Do not lean on `maxAge` staying `0` for correctness. It is an instance-wide setting, and someone will raise it for a different screen. If a read must be fresh, say so at the call site.

### Cache-then-refresh

```ts
const render = (result: QueryResult<Data>) => setState(result.data)

try {
  render(await executeQuery(dc, 'ListArticles', vars, {
    fetchPolicy: QueryFetchPolicy.CACHE_ONLY,
  }))
} catch {
  // No cache yet on a first run. Not an error worth showing.
}

render(await executeQuery(dc, 'ListArticles', vars, {
  fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
}))
```

## Realtime that actually pushes

A subscription is only half the work. The server has to know the query can be affected by a mutation.

```graphql
# Primary-key lookup: implicit, nothing to declare.
query GetMovieById($id: UUID!) @auth(level: PUBLIC) {
  movie(id: $id) { id title rating }
}

# Anything else needs a refresh signal, and the narrower the condition the better.
query ListMoviesByGenre($genre: String, $limit: Int)
@auth(level: PUBLIC)
@refresh(onMutationExecuted: {
  operation: "UpdateMovie",
  condition: "request.variables.genre == mutation.variables.genre"
}) {
  movies(where: { genre: { eq: $genre } }, limit: $limit) { id title }
}
```

A wide condition means every write refreshes every subscriber, which costs database work and battery on devices that did not need the update.

In React:

```tsx
const { data, loading, error } = useSqlConnectQuery(dc, 'GetMovieById', { id }, {
  subscribe: true,
})
```

Outside React, always keep the returned function and call it:

```ts
useEffect(() => subscribe(dc, 'GetMovieById', { id }, { next: setMovie }), [id])
```

Two screens subscribing to the same query with the same variables share one native subscription, so you do not need to hoist it into a store to avoid duplication.

## Auth

Sign in with `@react-native-firebase/auth`. There is nothing to bridge.

```ts
import { getAuth, signInWithEmailAndPassword, signOut } from '@react-native-firebase/auth'

await signInWithEmailAndPassword(getAuth(), email, password)
await executeQuery(dc, 'GetMyProfile')     // USER level, works now

await signOut(getAuth())
await executeQuery(dc, 'GetMyProfile')     // throws, code 'unauthenticated'
```

### Anonymous users

`@auth(level: USER)` **rejects anonymous users**, even though their token is real and verified. The server answers with `unauthenticated` and `debug_details: "@auth(level: USER) doesn't allow anonymous users"`.

If anonymous callers should be allowed, the operation has to say so:

```graphql
query GetMyDraft @auth(level: USER_ANON) { ... }
```

### After sign-out, the cache is still there

This one is worth being precise about, because getting it wrong shows one user another user's data.

**`terminate()` does not clear the cache.** It closes the native instance and cancels its subscriptions, nothing more. With the default `storage: 'persistent'` the cached responses stay on disk, survive an app restart, and are still there for the next person who signs in on that device.

So do not rely on sign-out to protect user-scoped data. Pick one of these instead:

```ts
// Option 1, the simplest: read user-scoped data from the server.
await executeQuery(dc, 'GetMyProfile', undefined, {
  fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
})
```

```ts
// Option 2: keep user-scoped operations on an instance that caches in memory
// only, so nothing outlives the process.
export const userScoped = getSqlConnect(config, {
  cacheSettings: { storage: 'memory' },
})
```

Note that option 2 needs a **separate connector** if the same connector also serves public data you want cached on disk, since cache settings are per instance and instances are keyed by connector.

Either way, `@auth` still protects the server: a signed-out caller cannot fetch another user's rows. The exposure is limited to what is already cached on that device, and only through `CACHE_ONLY` or a `PREFER_CACHE` read inside `maxAge`. That is a small window, but it is not zero, and it is the kind of thing that is much cheaper to get right now than to explain later.

### Diagnosing `unauthorized`

```ts
console.log(await getDiagnostics(dc))
```

If `hasCurrentUser` is `false`, the problem is on the auth side, not Data Connect. If it is `true` and the uid is right, the `@auth` rule on the operation is refusing the call, and the server's `debug_details` in the error will say which one.

## Error handling

```ts
import { SqlConnectError } from 'rn-sql-connect'

const load = async () => {
  try {
    return await executeQuery(dc, 'ListArticles', vars)
  } catch (error) {
    if (!(error instanceof SqlConnectError)) {
      throw error
    }

    switch (error.code) {
      case 'unauthenticated':
        return redirectToSignIn()
      case 'unavailable':
        // Network or backend. Retrying makes sense.
        return showRetry()
      case 'partial-error':
        // Data came back with errors alongside it. Your call.
        reportToCrashlytics(error)
        return error.partialData as ListArticlesData
      default:
        reportToCrashlytics(error)
        throw error
    }
  }
}
```

Include `nativeCode` and `graphQLErrors` in bug reports. The first says what the platform actually reported, the second says which field failed and where.

## Multiple connectors

```ts
export const core = getSqlConnect({ connector: 'core', location, serviceId })
export const tramev = getSqlConnect({ connector: 'tramev', location, serviceId })
```

Independent instances, independent caches, independent subscriptions. Both share the same Firebase app and therefore the same identity.

## A secondary Firebase app

```ts
const dc = getSqlConnect(config, { appName: 'secondary' })
```

The app must already be initialised by `@react-native-firebase/app`. Note this path is implemented but has not been exercised on a device.

## Migrating off the JavaScript web SDK

Do it in layers, keeping both paths alive until you trust the new one.

**1. Generate the typed wrappers.** See [codegen.md](codegen.md). Function names match the web SDK, so call sites do not change shape.

**2. Put a switch behind the data layer**, not at every call site:

```ts
// src/services/dataconnect/client.ts
import * as native from '@/src/dataconnect/tramev'
import * as web from '@dataconnect/tramev'

export const listNews = (vars: ListNewsVariables) =>
  useNativeDataConnect ? native.listNews(dc, vars) : web.listNews(webDc, vars)
```

**3. Run both for a while on internal builds** and compare the JSON. Pay attention to `Timestamp`, `Int64` and `UUID`: those are the fields where a bridging bug would be silent rather than loud.

**4. Enable by operation group**, easiest first: public reads, then user reads, then mutations.

**5. Remove the web SDK last**, and check what else depends on it first. In one app the only remaining user was `httpsCallable`, which had nothing to do with Data Connect but would have broken the build if the package had been removed without noticing.

What disappears at the end: the second Firebase JS app, the custom-token bridge that gave it an identity, the App Check `CustomProvider` relay, and the `firebase` package itself.

## Testing app code that uses this package

Mock the module, not the native layer:

```ts
jest.mock('rn-sql-connect', () => ({
  getSqlConnect: () => ({ key: 'test' }),
  executeQuery: jest.fn().mockResolvedValue({ data: { movies: [] }, source: 'server' }),
  executeMutation: jest.fn().mockResolvedValue({ data: {} }),
  subscribe: jest.fn(() => () => {}),
  QueryFetchPolicy: { PREFER_CACHE: 'PREFER_CACHE', CACHE_ONLY: 'CACHE_ONLY', SERVER_ONLY: 'SERVER_ONLY' },
  SqlConnectError: class extends Error {},
}))
```

For the real native path, run the example app against the emulator: [local-testing.md](local-testing.md).

## Things this package will not do for you

- **Retries.** Add them where you know the operation is idempotent.
- **A global query cache keyed by component.** The native SDK caches responses; it does not replace React Query.
- **Optimistic updates.** Realtime already gives you the corrected value quickly; if you need optimism, keep it in your own state.
- **Sync engine behaviour.** The cache serves reads, it does not queue writes made while offline.
