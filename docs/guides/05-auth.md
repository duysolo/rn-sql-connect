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

Two separate questions, and mixing them up leads to the wrong fix.

### Can the next person who signs in read it? No.

Both SDKs scope cached rows by the signed-in uid, so this is handled for you:

- Apple derives the cache file name from a hash of the connector config **plus a hash of the uid**, and swaps files when the auth state changes. Different user, different file.
- Android keeps one database and scopes it internally: `users(auth_uid)`, with `queries` and `entities` both keyed `UNIQUE (user_id, ...)` and cascading from it. Different user, different rows.

So a `CACHE_ONLY` read after another user signs in does not return the previous user's data. It misses.

### Is their data still on the device? Yes, until you clear it.

That is the real exposure, and it is about data at rest rather than one user reading another's:

**`terminate()` does not clear the cache.** It closes the native instance and cancels its subscriptions, nothing more. With the default `storage: 'persistent'` the rows stay in an app-private SQLite database and survive an app restart.

For sign-out, and especially for account deletion, erase them:

```ts
import { getAuth, signOut } from '@react-native-firebase/auth'
import { clearCache } from 'rn-sql-connect'

await signOut(getAuth())
await clearCache()   // deletes every Data Connect cache file for this app
```

Sign out first. On Apple platforms the auth change makes the SDK close the file it was holding, so the deletion is complete rather than leaving one open handle alive until the process exits.

If you would rather never write user data to disk in the first place, the alternatives still apply:

```ts
// Read user-scoped data from the server.
await executeQuery(dc, 'GetMyProfile', undefined, {
  fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
})
```

```ts
// Or keep user-scoped operations on an instance that caches in memory only.
export const userScoped = getSqlConnect(config, {
  cacheSettings: { storage: 'memory' },
})
```

The second needs a **separate connector** if the same connector also serves public data you want cached on disk, since cache settings are per instance and instances are keyed by connector.

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
