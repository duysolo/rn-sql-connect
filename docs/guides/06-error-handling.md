# Error handling

Every failure arrives as a `SqlConnectError` with a code that means the same thing on both platforms.

- [The shape](#the-shape)
- [Handling by code](#handling-by-code)
- [Partial errors](#partial-errors)
- [What to include in a bug report](#what-to-include-in-a-bug-report)

## The shape

```ts
import { SqlConnectError } from 'rn-sql-connect'

try {
  await executeQuery(dc, 'GetProfile')
} catch (error) {
  if (error instanceof SqlConnectError) {
    error.code            // portable code, see the reference
    error.operationName   // which call failed
    error.graphQLErrors   // [{ message, path }]
    error.partialData     // set when code is 'partial-error'
    error.nativeCode      // the original platform error
  }
}
```

Android throws a tree of exceptions and Apple platforms expose four unrelated structs. Both are normalised into one list of codes, with the original kept in `nativeCode`. gRPC status codes are read directly rather than guessed from message text, so the same failure produces the same code on both platforms.

Full list: [error codes](../reference/error-codes.md).

## Handling by code

```ts
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
        reportToCrashlytics(error)
        return error.partialData as ListArticlesData
      default:
        reportToCrashlytics(error)
        throw error
    }
  }
}
```

This package does not retry for you. Add retries where you know the operation is idempotent.

## Partial errors

Data Connect can answer with data **and** errors at the same time. That arrives as `code: 'partial-error'` with `partialData` populated.

It is surfaced as an error rather than silently returned, because whether partial data is usable is a decision only the caller can make. A list screen might render what came back; a payment screen should not.

## What to include in a bug report

1. `await getDiagnostics(dc)` output.
2. `error.code`, `error.nativeCode`, `error.graphQLErrors`.
3. The log with `globalThis.RNSqlConnectDebug = true`, which prints every native call and its result.
4. Platform, React Native version, `@react-native-firebase/app` version.

---

Next: [Code generation](07-code-generation.md) | [Error codes](../reference/error-codes.md) | [Troubleshooting](../troubleshooting.md)
