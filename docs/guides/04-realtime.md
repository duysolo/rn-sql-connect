# Realtime

Keeping a query result live, and the server-side directive that makes it possible.

- [Subscribing](#subscribing)
- [The server has to agree](#the-server-has-to-agree)
- [Sharing and cleanup](#sharing-and-cleanup)

## Subscribing

```ts
const unsubscribe = subscribe<GetMovieData>(dc, 'GetMovieById', { id }, {
  next: result => setMovie(result.data.movie),
  error: error => console.warn(error.code, error.message),
})

// later
unsubscribe()
```

In React, the hook does the same thing with cleanup handled:

```tsx
const { data, loading, error } = useSqlConnectQuery(dc, 'GetMovieById', { id }, {
  subscribe: true,
})
```

Outside React, always keep the returned function and call it:

```ts
useEffect(() => subscribe(dc, 'GetMovieById', { id }, { next: setMovie }), [id])
```

## The server has to agree

A subscription is only half the work. The server must know that a mutation can affect the query, otherwise the stream simply never pushes.

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

A wide condition means every write refreshes every subscriber, which costs database work on the server and battery on devices that did not need the update.

Operations live on the server, so this is a schema change. If you do not own the schema, it is a hand-off, not a client fix.

## Sharing and cleanup

- **Callers sharing a query share one native subscription.** Equal variables mean the same subscription, whatever the key order in the object, so mounting the same screen twice does not double the server-side cost. The stream is cancelled when the last observer detaches.
- **A late joiner gets the latest value immediately**, rather than waiting for the next push.
- Everything is torn down when the React instance goes away, so a Fast Refresh does not leak gRPC streams.

To assert that in tests:

```ts
import { activeSubscriptionCount, getDiagnostics } from 'rn-sql-connect'

expect(activeSubscriptionCount()).toBe(0)                    // JavaScript side
expect((await getDiagnostics(dc)).activeSubscriptions).toBe(0) // native side
```

---

Next: [Auth](05-auth.md) | [Error handling](06-error-handling.md) | [Troubleshooting](../troubleshooting.md#a-subscription-never-fires-after-the-first-value)
