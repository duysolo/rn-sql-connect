# Migrating from the JavaScript web SDK

A staged migration that keeps both paths alive until the new one has earned trust.

## What you get rid of

Running `firebase/data-connect` inside React Native works, but it usually comes with:

- a second Firebase JS app alongside `@react-native-firebase`,
- a custom-token bridge so that app has an identity,
- an App Check `CustomProvider` relaying the native token,
- an in-memory cache with no expiry,
- the `firebase` package in the bundle.

All five disappear at the end of this.

## The steps

**1. Generate typed wrappers.** See [code generation](07-code-generation.md). Function names match the web SDK, so call sites do not change shape.

**2. Put a switch behind your data layer**, not at every call site:

```ts
// src/services/dataconnect/client.ts
import * as native from '@/src/dataconnect/tramev'
import * as web from '@dataconnect/tramev'

export const listNews = (vars: ListNewsVariables) =>
  useNativeDataConnect ? native.listNews(dc, vars) : web.listNews(webDc, vars)
```

**3. Run both on internal builds and compare the JSON.** Pay attention to `Timestamp`, `Int64` and `UUID`. Those are the fields where a bridging bug is silent rather than loud.

**4. Enable by operation group**, easiest risk first: public reads, then user reads, then mutations.

**5. Remove the web SDK last**, and check what else depends on it first. In one app the only remaining user was `httpsCallable`, which had nothing to do with Data Connect but would have broken the build if the package had been removed without looking.

## Behaviour that changes

| | Web SDK in RN | This package |
| --- | --- | --- |
| Cache | memory, no expiry | on disk, `maxAge`, three fetch policies |
| Identity | whatever you bridged into the JS app | the native `FirebaseApp`, automatically |
| `Int64` | string | string, unchanged |
| Realtime | supported | supported, same `@refresh` requirement |

The cache change is the one to plan for. A screen that quietly depended on "the JS cache never expires" will start seeing fresh data, and a screen that depended on always hitting the server needs `SERVER_ONLY` spelled out. See [caching](03-caching.md).

---

Next: [Testing your app](09-testing-your-app.md) | [Caching](03-caching.md)
