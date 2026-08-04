# Documentation

Everything about using, configuring and extending `rn-sql-connect`, grouped by what you are trying to do.

## Start here

New to the package? Read the guides in order. Each one is short and ends with where to go next.

| # | Guide | What it covers |
| --- | --- | --- |
| 1 | [Getting started](guides/01-getting-started.md) | install, configure, first query |
| 2 | [Queries and mutations](guides/02-queries-and-mutations.md) | calling operations, variables, results |
| 3 | [Caching](guides/03-caching.md) | fetch policies, `maxAge`, what the cache outlives |
| 4 | [Realtime](guides/04-realtime.md) | subscriptions, and the server directive they need |
| 5 | [Auth](guides/05-auth.md) | identity, anonymous users, sign-out and the cache |
| 6 | [Error handling](guides/06-error-handling.md) | codes, partial errors, bug reports |
| 7 | [Code generation](guides/07-code-generation.md) | typed wrappers from your connector |
| 8 | [Migrating from the web SDK](guides/08-migrating-from-the-web-sdk.md) | a staged migration that keeps a way back |
| 9 | [Testing your app](guides/09-testing-your-app.md) | mocking, and what to cover |

## Look something up

| Reference | Use it for |
| --- | --- |
| [API](reference/api.md) | exact signatures and options |
| [Configuration](reference/configuration.md) | Podfile, Gradle, instance settings, pinned versions |
| [Error codes](reference/error-codes.md) | what a code means and what usually causes it |
| [Data types](reference/data-types.md) | how each Data Connect type arrives in JavaScript |

## When something is broken

[Troubleshooting](troubleshooting.md) opens with a symptom index: find the message you actually see, get the section.

## How it works inside

| Internals | Read when |
| --- | --- |
| [Bridge design](internals/bridge-design.md) | changing the native layer, or judging where a bug belongs |
| [iOS architecture](internals/ios-architecture.md) | touching the Apple side, or asking why the SDK is vendored |

## Working on this package

| | |
| --- | --- |
| [Local testing](contributing/local-testing.md) | the three loops, from a two-second unit run to a full device run against the emulator |
| [Releasing](contributing/releasing.md) | the publish checklist, versioning rules, and what must be in the tarball |

## Three things that explain most of the design

**Operations cross by name.** Adding one never requires a native rebuild. That is why the code generator only emits TypeScript.

**Values cross as JSON text.** Data Connect encodes `Int64`, `UUID`, `Date` and `Timestamp` as strings, and a bridge map would coerce them. Keep `Int64` as a string in your code too.

**Auth is shared, not wired.** Data Connect reads the signed-in user from the same `FirebaseApp` react-native-firebase configured. The entire iOS setup exists to protect that one property.
