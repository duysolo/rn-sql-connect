# Getting started

From an empty React Native app to a working query. Around twenty minutes, most of it waiting for builds.

## 1. Check the requirements first

This package is strict about its environment, deliberately: every requirement below is something that fails loudly at install time rather than mysteriously at runtime.

| Requirement | Minimum | Why |
| --- | --- | --- |
| React Native | 0.85 | `spm_dependency` in podspecs, stable codegen event emitters |
| Architecture | New Architecture | this package ships a TurboModule only |
| `@react-native-firebase/app` | 24.0.0 | Firebase comes from whatever version this package installs, read out of its `sdkVersions`. Verified on a real device with 24.1.1 (Firebase 12.10.0) and with 26.1.0 (Firebase 12.17.0) |
| iOS deployment target | 15.0 | required by the Apple Data Connect SDK |
| Android `minSdk` | 23 | required by Firebase BoM 34 |

You also need a Data Connect service to talk to. If you do not have one yet, work against the emulator: see [local testing](../contributing/local-testing.md), which needs no Firebase project at all.

## 2. Install

```sh
npm install rn-sql-connect @react-native-firebase/app
```

If Firebase is not set up in this app yet, do that first, following the [react-native-firebase installation guide](https://rnfirebase.io/). Concretely you need:

- `android/app/google-services.json`, and the `com.google.gms.google-services` Gradle plugin applied.
- `ios/GoogleService-Info.plist`, **added to the app target in Xcode**, not merely dropped in the folder. Xcode does not warn about the difference and `FirebaseApp.configure()` aborts at launch instead.

Everything below assumes those are in place. This package does not read them itself; it uses whatever `FirebaseApp` react-native-firebase configured.

### Android

Nothing to do. Autolinking picks up the module and the Firebase dependency comes from the BoM.

If your app already pins a Firebase BoM, keep it in charge:

```gradle
// android/build.gradle
ext {
  firebaseBomVersion = "34.16.0"
}
```

### iOS

Add two globals to the top of your `Podfile`, before any `target` block:

```ruby
# ios/Podfile
$RNFirebaseDisableSPM = true
$RNFirebaseAsStaticFramework = true
```

Then:

```sh
cd ios && pod install
```

`$RNFirebaseDisableSPM = true` is not optional. `pod install` refuses to proceed without it, with an explanation. The reason is in [iOS architecture](../internals/ios-architecture.md): the Apple Data Connect SDK is vendored into this package and takes Firebase from CocoaPods, so react-native-firebase has to resolve Firebase the same way. Otherwise the process ends up with two copies of `FirebaseCore` and Data Connect never sees the user you signed in.

Finally, configure Firebase in your `AppDelegate`, which react-native-firebase requires on Apple platforms:

```swift
import FirebaseCore

func application(
  _ application: UIApplication,
  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
) -> Bool {
  FirebaseApp.configure()
  // ... the rest of the React Native setup
}
```

Without it every call fails with `not-configured`, and the error message says exactly that.

## 3. Create an instance

```ts
// src/dataconnect/client.ts
import { getSqlConnect } from 'rn-sql-connect'

export const dc = getSqlConnect({
  connector: 'example',
  location: 'asia-southeast1',
  serviceId: 'example',
})
```

Those three values come from your `dataconnect.yaml` and `connector.yaml`, and are the same ones the generated web SDK exports as `connectorConfig`.

`getSqlConnect` is cheap and idempotent: calling it again with the same connector returns the same handle. Nothing touches the network until the first operation, so a module-level call like this is fine.

## 4. Run something

```ts
import { executeQuery, executeMutation } from 'rn-sql-connect'
import { dc } from './dataconnect/client'

const { data, source } = await executeQuery(dc, 'ListMoviesByGenre', { genre: 'Sci-Fi' })
console.log(source) // 'server' on the first call

await executeMutation(dc, 'CreateMovie', { title: 'Dune', genre: 'Sci-Fi' })
```

Operations are addressed **by name**, the same name that appears in your `.gql` file. That is what lets you add operations without rebuilding native code. For type safety, generate typed wrappers instead of calling by name everywhere: see [code generation](07-code-generation.md).

## 5. Point at the emulator during development

```ts
import { connectSqlConnectEmulator } from 'rn-sql-connect'

if (__DEV__) {
  connectSqlConnectEmulator(dc, { port: 9399 })
}
```

Call it before the first query. It throws if an operation already ran, because the native SDKs cannot switch afterwards. Leave `host` unset and each platform uses its own default, which maps correctly for both the Android emulator and the iOS simulator.

## 6. Sign in, if your operations require it

Nothing to wire up. Sign in with `@react-native-firebase/auth` and `@auth(level: USER)` operations start working:

```ts
import { getAuth, signInWithEmailAndPassword } from '@react-native-firebase/auth'

await signInWithEmailAndPassword(getAuth(), email, password)
// USER-level operations work from here on
```

There is no token to fetch, mint, refresh or pass anywhere. The native SDK reads the identity from the same `FirebaseApp`, which is the main reason this package exists.

**One rule that trips people up**: `@auth(level: USER)` **rejects anonymous users**. `signInAnonymously` gets you a verified token that the server still refuses, with `debug_details: "@auth(level: USER) doesn't allow anonymous users"`. Operations meant for anonymous callers need `@auth(level: USER_ANON)`.

## 7. Check your work

```ts
import { getDiagnostics } from 'rn-sql-connect'

console.log(await getDiagnostics(dc))
// { configured: true, hasCurrentUser: true, uid: '...', activeSubscriptions: 0, ... }
```

This reports what **native** sees, not what JavaScript believes. It answers the two questions that come up most: whether Data Connect can see the signed-in user, and whether subscriptions are leaking.

For a call-by-call trace:

```ts
globalThis.RNSqlConnectDebug = true
```

---

Next: [Queries and mutations](02-queries-and-mutations.md) | [Caching](03-caching.md) | [API reference](../reference/api.md)
