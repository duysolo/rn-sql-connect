# Troubleshooting

Every entry here is a failure that actually happened while building or testing this package, with the message you would see and what it means.


## Find your symptom

| What you see | Section |
| --- | --- |
| `pod install` fails mentioning Swift Package Manager | [pod install refuses](#pod-install-refuses-react-native-firebase-is-using-swift-package-manager) |
| `The native module 'RnSqlConnect' could not be found` | [native module not found](#the-native-module-rnsqlconnect-could-not-be-found) |
| `Could not find @react-native/gradle-plugin` | [gradle plugin](#could-not-find-react-nativegradle-plugin) |
| `This file must be compiled as Obj-C++` | [Obj-C++](#ios-build-fails-with-this-file-must-be-compiled-as-obj-c) |
| `not-configured` on every call | [not configured](#not-configured-firebase-app-default-is-not-configured) |
| App crashes at launch, API key length | [not configured](#not-configured-firebase-app-default-is-not-configured) |
| `Class FIRApp is implemented in both` | [duplicate FIRApp](#duplicate-firapp-warnings-in-the-log) |
| `unauthenticated` while signed in | [unauthenticated](#unauthenticated-on-an-operation-while-signed-in) |
| Data is older than the database | [stale data](#a-query-returns-stale-data) |
| Another user's data after switching accounts | [cache after sign-out](#the-previous-users-data-appears-after-signing-in-as-someone-else) |
| A subscription only fires once | [subscription silent](#a-subscription-never-fires-after-the-first-value) |
| Large numbers are off by one | [numbers wrong](#numbers-come-back-subtly-wrong) |
| Emulator port taken, or rejects an operation | [emulator](#emulator) |

## Install and build

### `pod install` refuses: react-native-firebase is using Swift Package Manager

```
[rn-sql-connect] react-native-firebase is resolving Firebase through Swift Package
Manager, and this package resolves it through CocoaPods.
```

Add to the top of your `Podfile`, before any `target` block:

```ruby
$RNFirebaseDisableSPM = true
$RNFirebaseAsStaticFramework = true
```

Why this is a hard requirement rather than a preference: [iOS architecture](internals/ios-architecture.md).

### `The native module 'RnSqlConnect' could not be found`

In order of likelihood:

1. iOS: `pod install` has not run since installing the package.
2. Android: the app was not rebuilt, only reloaded. Metro cannot add native code.
3. The app runs on the Old Architecture. This package ships a TurboModule only.
4. Expo Go. Native modules cannot work there; use a development build.

### `Could not find @react-native/gradle-plugin`

You are in a monorepo and `node_modules` is hoisted above the app. The example app's `android/settings.gradle` in this repo shows the fix: look one level higher.

### iOS build fails with `This file must be compiled as Obj-C++`

Something is importing the codegen spec header from a plain Objective-C or Swift context. In this package the interface lives entirely inside `RnSqlConnect.mm` for that reason. If you hit this in your own module, move the interface out of the public header.

## Runtime

### `not-configured: Firebase app "[DEFAULT]" is not configured`

On iOS, `AppDelegate` is missing `FirebaseApp.configure()`:

```swift
import FirebaseCore
// inside didFinishLaunchingWithOptions
FirebaseApp.configure()
```

If it is already there, check that `GoogleService-Info.plist` is a **member of the app target**, not merely present in the folder. Xcode does not warn about the difference; `FirebaseApp.configure()` aborts at launch instead.

Also seen on iOS: the app crashes at launch from inside FirebaseInstallations with

```
`FirebaseOptions.APIKey` doesn't match the expected format: API Key length must be 39 characters
```

That is a malformed `GoogleService-Info.plist`, usually a hand-written one for emulator testing. The key has to be exactly 39 characters.

### Duplicate `FIRApp` warnings in the log

```
objc[...]: Class FIRApp is implemented in both ... and ...
```

Two copies of `FirebaseCore` in the process. Data Connect will report `not-configured` even though the app configured Firebase at launch, because each copy keeps its own registry. It means something is pulling Firebase through Swift Package Manager alongside the CocoaPods copy. Full explanation in [iOS architecture](internals/ios-architecture.md).

### `unauthenticated` on an operation, while signed in

Check what native sees first:

```ts
console.log(await getDiagnostics(dc))
```

- `hasCurrentUser: false`: the sign-in did not reach the Firebase app this instance uses. Check `appName` if you use a secondary app.
- `hasCurrentUser: true` with the right uid: the server is refusing the call. The most common cause is **`@auth(level: USER)` with an anonymous user**, which is rejected by design. The server says so in `debug_details`. Use `USER_ANON` on the operation if anonymous callers should be allowed.

### A query returns stale data

Expected, if `maxAge` is set and the policy is `PREFER_CACHE`. Check `result.source`. If a read must be fresh, ask for it:

```ts
await executeQuery(dc, 'GetAppConfig', undefined, {
  fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
})
```

This exact shape caused a real incident before this package existed: a config version was read from an in-memory cache with no expiry, so a screen kept showing the previous version until the app restarted, and the whole refresh chain that depended on that version stopped silently.

### The previous user's data appears after signing in as someone else

The on-disk cache is not cleared by signing out, nor by `terminate()`. A `CACHE_ONLY` read, or a `PREFER_CACHE` read inside `maxAge`, can still serve rows fetched by the previous user on that device.

The server is not the problem here: `@auth` still refuses the request. The exposure is the local cache. Read user-scoped data with `SERVER_ONLY`, or keep it on an instance configured with `storage: 'memory'`. See [auth guide](guides/05-auth.md#after-sign-out-the-cache-is-still-there).

### `CACHE_ONLY` throws or returns nothing

There is no cached entry yet. The first read for a set of variables has to come from the server.

### A subscription never fires after the first value

The operation has no refresh signal. Primary-key lookups get one implicitly; everything else needs `@refresh(onMutationExecuted: ...)`. That is a server-side schema change. See [realtime guide](guides/04-realtime.md#the-server-has-to-agree).

### Subscriptions pile up during development

Check that they are actually being released:

```ts
console.log(activeSubscriptionCount())          // JavaScript side
console.log(await getDiagnostics(dc))           // native side
```

Both should return to zero after unsubscribing. If the native number stays high while the JavaScript one is zero, that is a bug in this package worth reporting.

### Numbers come back subtly wrong

`Int64` is carried as a **string**. If you convert it with `Number()` you lose precision above 2^53. Keep it as a string, or use `BigInt` when you need arithmetic.

## Emulator

### `Emulator port 9399 is taken`

An earlier run is still alive:

```sh
lsof -ti:9399,9099 | xargs kill
```

### The emulator rejects an operation at load time

For example:

```
Variable "$tags" of type "[String]" used in position expecting type "[String!]"
```

The Data Connect emulator type-checks operations when it loads them, so this is a real schema error, not an emulator quirk. Data Connect maps a nullable list to a list of non-null elements in insert inputs.

### The emulator returns an empty body for a direct HTTP call

Use the `v1beta` path, not `v1`:

```sh
curl -s -X POST \
  'http://127.0.0.1:9399/v1beta/projects/demo-x/locations/asia-southeast1/services/example/connectors/example:executeQuery' \
  -H 'Content-Type: application/json' \
  -d '{"operationName":"ListMoviesByGenre","variables":{"genre":"Sci-Fi"}}'
```

## Reporting a bug

Include:

1. `await getDiagnostics(dc)` output.
2. `error.code`, `error.nativeCode` and `error.graphQLErrors`.
3. The log with `globalThis.RNSqlConnectDebug = true` set, which prints every native call and its result.
4. Platform, React Native version, and `@react-native-firebase/app` version.

---

Still stuck? Open an issue with the four items listed above, or read [bridge design](internals/bridge-design.md) to judge whether the bug belongs to this package or upstream.
