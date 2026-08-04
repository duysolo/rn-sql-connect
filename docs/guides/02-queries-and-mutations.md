# Queries and mutations

The two calls you will make most, and the details that decide whether they behave.

- [Calling an operation](#calling-an-operation)
- [Variables](#variables)
- [Reading the result](#reading-the-result)
- [Types](#types)

## Calling an operation

```ts
import { executeQuery, executeMutation } from 'rn-sql-connect'

const result = await executeQuery(dc, 'ListMoviesByGenre', { genre: 'Sci-Fi' })
await executeMutation(dc, 'CreateMovie', { title: 'Dune', genre: 'Sci-Fi' })
```

Operations are addressed **by name**, the same name that appears in your `.gql` file. Adding an operation therefore never requires a native rebuild, which is the point of the generic bridge: [bridge design](../internals/bridge-design.md).

Calling by string is fine to start with, but generate typed wrappers before the call sites multiply: [code generation](07-code-generation.md).

## Variables

A plain object, serialised to JSON.

`undefined` properties are **dropped**, `null` properties are **kept**. In GraphQL those mean different things, and Data Connect mutations act on the difference:

```ts
await executeMutation(dc, 'UpdateProfile', {
  displayName: 'A',
  photoUrl: null,       // clears the column
  bio: undefined,       // leaves the column alone
})
```

## Reading the result

```ts
const { data, source } = await executeQuery(dc, 'ListMoviesByGenre', { genre })

data     // whatever the operation selects
source   // 'cache' | 'server'
```

`source` matters whenever a stale read would be a bug. A cached result looks exactly like a fresh one otherwise. See [caching](03-caching.md).

Mutations return `{ data }` only. They never read the cache.

## Types

Without generated wrappers, pass the types yourself:

```ts
const result = await executeQuery<ListMoviesData, ListMoviesVariables>(
  dc,
  'ListMoviesByGenre',
  { genre: 'Sci-Fi' },
)
```

Two of them are worth remembering because they are easy to get wrong:

- `Int64` arrives as a **string**. `Number()` on it loses precision above 2^53.
- `Timestamp` arrives as a string whose format the server normalises. Compare instants, not text.

Full table: [data types](../reference/data-types.md).

---

Next: [Caching](03-caching.md) | [Realtime](04-realtime.md) | [API reference](../reference/api.md#operations)
