# Data types

How each Data Connect type looks by the time it reaches your JavaScript.

| Data Connect type | JavaScript | Notes |
| --- | --- | --- |
| `String` | `string` | |
| `Int` | `number` | |
| `Float` | `number` | |
| `Boolean` | `boolean` | |
| `UUID` | `string` | unchanged, not parsed |
| `Int64` | **`string`** | see below |
| `Date` | `string` | `YYYY-MM-DD` |
| `Timestamp` | `string` | RFC 3339, format normalised by the server |
| `Any` | any JSON value | objects, arrays, nulls, nested freely |
| `[T]` | `T[]` | one-dimensional only, Data Connect does not support nested arrays |
| `Vector` | `number[]` | untested in this package |
| enum | `string` | untested in this package |

## Why values cross as JSON text

Results travel the bridge as a JSON string rather than as a bridge map. A map round trip converts numbers through `double`, which silently corrupts `Int64`, and can reshape date strings.

The cost is one `JSON.parse` per call. The benefit is that `9007199254740993` arrives as `9007199254740993` and not as `9007199254740992`. That case is asserted on both platforms in the smoke suite.

More on the design: [bridge design](../internals/bridge-design.md).

## Int64

Keep it as a string. `Number()` on it loses precision above 2^53, quietly, and only for large values, which means it survives every test written with small numbers.

```ts
const total = movie.viewCount          // '9007199254740993'
const wrong = Number(total)            // 9007199254740992
const right = BigInt(total)            // 9007199254740993n
```

## Timestamp

The server normalises the format, so `'2026-08-04T09:30:00Z'` comes back as `'2026-08-04T09:30:00.000000Z'`. Compare instants, never text:

```ts
Date.parse(movie.releasedAt) === Date.parse(expected)   // correct
movie.releasedAt === expected                            // fails for no good reason
```

## Verified

Every type in the table above except `Vector` and enum is round-tripped through a real device against a real emulator in the smoke suite, including a nested `Any` containing a null inside an array, and lists of `String` and `Int`.

---

See also: [queries and mutations](../guides/02-queries-and-mutations.md#types) | [API reference](api.md#how-values-cross-the-bridge)
