# Auth

How identity reaches Data Connect, the one rule that surprises people, and what the cache does after sign-out.

- [There is nothing to wire up](#there-is-nothing-to-wire-up)
- [Anonymous users are not USER](#anonymous-users-are-not-user)
- [After sign-out, the cache is still there](#after-sign-out-the-cache-is-still-there)
- [Diagnosing a refused call](#diagnosing-a-refused-call)
- [App Check](#app-check)

## There is nothing to wire up

Sign in with `@react-native-firebase/auth` and `@auth(level: USER)` operations start working.

```ts
import { getAuth, signInWithEmailAndPassword, signOut } from '@react-native-firebase/auth'

await signInWithEmailAndPassword(getAuth(), email, password)
await executeQuery(dc, 'GetMyProfile')     // USER level, works now

await signOut(getAuth())
await executeQuery(dc, 'GetMyProfile')     // throws, code 'unauthenticated'
```

No token to fetch, mint, refresh or pass. The native SDK reads the identity from the same `FirebaseApp` that react-native-firebase configured, which is the main reason this package exists at all. The iOS setup is shaped entirely around protecting that property: [ios architecture](../internals/ios-architecture.md).

Verified on both platforms: an operation refused while signed out, then accepted after signing in, with native reporting the same uid.

## Anonymous users are not USER

`@auth(level: USER)` **rejects anonymous users**, even though their token is real and the server verifies it. The response is `unauthenticated`, and the server explains itself:

```
debug_details: "@auth(level: USER) doesn't allow anonymous users"
```

If anonymous callers should be allowed, the operation has to say so:

```graphql
query GetMyDraft @auth(level: USER_ANON) { ... }
```

This costs an hour of debugging if you meet it without knowing, because everything on the client looks correct: the user is signed in, the uid is right, and native diagnostics agree.

## After sign-out, the cache is still there

Worth being precise about, because getting it wrong shows one user another user's data.

**`terminate()` does not clear the cache.** It closes the native instance and cancels its subscriptions, nothing more. With the default `storage: 'persistent'` the cached responses stay on disk, survive an app restart, and are still there for the next person who signs in on that device.

Do not rely on sign-out to protect user-scoped data. Pick one:

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

Option 2 needs a **separate connector** if the same connector also serves public data you want cached on disk, since cache settings are per instance and instances are keyed by connector.

Either way `@auth` still protects the server: a signed-out caller cannot fetch another user's rows. The exposure is limited to what is already on that device, and only through `CACHE_ONLY` or a `PREFER_CACHE` read inside `maxAge`. Small, but not zero, and much cheaper to get right now than to explain later.

## Diagnosing a refused call

```ts
console.log(await getDiagnostics(dc))
```

| What you see | What it means |
| --- | --- |
| `hasCurrentUser: false` | the sign-in never reached the Firebase app this instance uses. Check `appName` if you use a secondary app |
| `hasCurrentUser: true`, uid correct | the server refused the call, so look at the `@auth` rule on the operation. Its `debug_details` in the error says which one |

## App Check

Also automatic. The native SDKs attach the App Check token from the same `FirebaseApp`, so enabling App Check enforcement on the service needs no client change.

Implemented but not yet exercised on a device in this repo, so treat it as unproven rather than broken.

---

Next: [Error handling](06-error-handling.md) | [Caching](03-caching.md#the-cache-outlives-the-session) | [Troubleshooting](../troubleshooting.md#unauthenticated-on-an-operation-while-signed-in)
