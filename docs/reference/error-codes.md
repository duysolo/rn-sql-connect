# Error codes

Every value `SqlConnectError.code` can take. The same code means the same thing on both platforms.

| Code | Meaning | Usual cause |
| --- | --- | --- |
| `unauthenticated` | no signed-in user, or the token was rejected | signed out, or `@auth(level: USER)` with an anonymous user |
| `unauthorized` | signed in, but the `@auth` rule refused the call | the rule on the operation, not the client |
| `not-found` | unknown operation, or a lookup found nothing the schema requires | a typo in the operation name, or a connector that was never deployed |
| `invalid-argument` | bad variables, or an API misuse this package caught first | wrong variable type, or `connectSqlConnectEmulator` called too late |
| `partial-error` | the server returned data **and** errors | one field of the selection failed |
| `unavailable` | network or backend unreachable, including timeouts | offline, or the emulator is not running |
| `cancelled` | the call was cancelled | the React instance went away mid-call |
| `not-configured` | Firebase is not configured, or the handle was terminated | missing `FirebaseApp.configure()` on iOS |
| `internal` | anything else the platform reported | see `nativeCode` |
| `unknown` | a failure with no recognisable shape | see `nativeCode` |

## How a code is decided

Both platforms normalise into this list rather than exposing their own taxonomy, because they do not agree: Android throws a tree of exceptions, Apple platforms expose four unrelated structs.

Where a gRPC status is available it is read directly, not guessed from the message text. That is why the same failure produces the same code on both platforms, verified by the smoke suite for `not-found`.

`nativeCode` always keeps the original, for example `DataConnectOperationException` on Android or `DataConnectOperationError` on Apple platforms. Include it in bug reports.

## Codes this package raises itself

Three failures never reach native, because catching them earlier gives a better message:

| Situation | Code |
| --- | --- |
| `getSqlConnect` called again with different settings | `invalid-argument` |
| `connectSqlConnectEmulator` after an operation started | `invalid-argument` |
| using a handle after `terminate()` | `not-configured` |

---

See also: [error handling guide](../guides/06-error-handling.md) | [API reference](api.md#errors)
