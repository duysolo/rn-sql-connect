# Bridge design

Why this package looks the way it does. Read this before changing the native layer, or when deciding whether a bug belongs here or upstream.

- [Operations cross by name](#operations-cross-by-name)
- [Values cross as JSON text](#values-cross-as-json-text)
- [The untyped path on each platform](#the-untyped-path-on-each-platform)
- [Subscriptions](#subscriptions)
- [Errors](#errors)

## Operations cross by name

The native call surface takes an operation name and a variables string:

```ts
executeQuery(instanceKey, operationName, variablesJson, fetchPolicy): Promise<string>
```

The alternative would have been to generate Kotlin and Swift per connector, which is what the official quickstarts do. That was rejected because it makes every schema change a native rebuild, and in a codebase where the schema and the app live in different repositories, that is a coordination cost on every single change.

The consequence is that type safety lives entirely in TypeScript, produced by [the generator](../guides/07-code-generation.md). Native does no validation of its own, and does not need to: the server validates.

## Values cross as JSON text

Both directions carry JSON strings rather than bridge maps.

Data Connect encodes `Int64`, `UUID`, `Date` and `Timestamp` as strings on the wire. A `ReadableMap` or `NSDictionary` round trip pushes numbers through `double`, so `9007199254740993` becomes `9007199254740992`, silently, and only for values large enough that nobody notices until an invoice is wrong.

The cost is one `JSON.parse` per call, which is cheaper than the tree conversion it replaces for any payload of real size.

## The untyped path on each platform

Neither SDK offers a public untyped API, so each platform needed a different way in.

**Apple** was nearly free. `ProtoCodec` encodes variables with `JSONEncoder` and decodes results with `JSONDecoder`, so one generic `Codable` tree covers every operation.

**Android** was the hard part. `DataConnectUntypedVariables` and `DataConnectUntypedData` exist in the source but are `internal`, and are placeholders that throw. What made it possible instead:

- the proto encoder accepts `StructureKind.CLASS`, and keys fields with `descriptor.getElementName(index)`,
- both the encoder and the decoder special-case `AnyValueSerializer`, writing and reading the wrapped protobuf value directly.

So `VariablesSerializer` builds a class descriptor at runtime with one element per variable and encodes each with `AnyValueSerializer`, and the whole response is decoded by passing `AnyValueSerializer` as the data deserializer. Both behaviours are public API: `AnyValue` is documented as the mapping for the `Any` scalar.

Nulls go through `encodeNullableSerializableElement`, so an explicit null reaches the server as null rather than being dropped. The encoder writes it as `nullProtoValue` instead of omitting the field, which was verified in the SDK source before relying on it.

A useful side effect: no `@Serializable` classes are declared, so the Kotlin serialization compiler plugin is not needed, and consuming apps have one fewer version to keep aligned.

## Subscriptions

Ids are minted in JavaScript, not native, so a cancel that arrives before the subscription finished starting can still be matched. Both platforms had a race here and both are fixed, differently:

- Android registers the job before starting it, using `CoroutineStart.LAZY`.
- Apple records the id in a cancelled set, which the start hop checks before storing the cancellable.

Deduplication happens in JavaScript: subscribers with equal variables share one native subscription, counted by reference. The native SDKs deduplicate too, but doing it here saves bridge crossings.

Everything is torn down on `invalidate`, which React Native calls when the instance goes away, including on every Fast Refresh.

## Errors

Android throws a tree of exceptions, Apple platforms expose four unrelated structs. Neither maps onto the other, so both normalise into one shared list of codes, and the platform original is kept in `nativeCode`.

Where a gRPC status is available it is read directly rather than matched from message text. On Apple platforms that became possible only because the SDK is vendored, which makes `GRPC` importable from this module.

---

See also: [iOS architecture](ios-architecture.md) | [data types](../reference/data-types.md)
