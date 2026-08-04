# Caching

How the on-disk cache behaves, and how to decide what goes through it.

- [The settings](#the-settings)
- [The trap in maxAge](#the-trap-in-maxage)
- [Choosing a fetch policy](#choosing-a-fetch-policy)
- [Cache-then-refresh](#cache-then-refresh)
- [The cache outlives the session](#the-cache-outlives-the-session)

## The settings

```ts
const dc = getSqlConnect(config, {
  cacheSettings: { storage: 'persistent', maxAge: '5m' },
})
```

| Field | Values | Default |
| --- | --- | --- |
| `storage` | `'persistent'` on disk, `'memory'` | `'persistent'` |
| `maxAge` | seconds, or `'30s'`, `'5m'`, `'1h30m'` | `0` |

`maxAge` takes the same syntax as `connector.yaml`, so a policy can be copied between the two without translating units.

Settings are locked when the instance is created. Neither native SDK allows changing them afterwards.

## The trap in maxAge

The default is `0`, which means responses are cached but every `PREFER_CACHE` call **still revalidates against the server**. Cached values are served only once `maxAge` is raised, or when the caller asks for `CACHE_ONLY`.

That default is deliberate and safe. The trap is the other direction: once somebody raises `maxAge` for one screen, every `PREFER_CACHE` read in the app can start serving cached data, including reads that were quietly relying on the default.

So do not treat `maxAge: 0` as a correctness guarantee. If a read must be fresh, say so at the call site.

## Choosing a fetch policy

The decision is not about performance, it is about what a stale read costs.

| Policy | Behaviour |
| --- | --- |
| `PREFER_CACHE` | default. Serves cache if it is younger than `maxAge`, otherwise revalidates |
| `CACHE_ONLY` | never touches the network. Returns whatever is cached, however old |
| `SERVER_ONLY` | always fetches, then refreshes the cache |

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
await executeQuery(dc, 'ListArticles', vars, {
  fetchPolicy: QueryFetchPolicy.CACHE_ONLY,
})
```

Always check `result.source` when a stale read would be a bug. A cached result is indistinguishable from a fresh one at the call site otherwise.

## Cache-then-refresh

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

## The cache outlives the session

`persistent` means on disk and across app restarts. **Nothing clears it automatically**, not `terminate()`, not signing out. Treat it as a device-level cache when deciding what to put behind it.

That has a privacy consequence worth reading before shipping: [auth, after sign-out](05-auth.md#after-sign-out-the-cache-is-still-there).

---

Next: [Realtime](04-realtime.md) | [Auth](05-auth.md) | [API reference](../reference/api.md#caching)
