# Configuration

Every knob, in one place: what your app has to set, and what it may set.

- [Podfile](#podfile)
- [Gradle](#gradle)
- [AppDelegate](#appdelegate)
- [Instance settings](#instance-settings)
- [Pinned versions](#pinned-versions)
- [Debug flags](#debug-flags)

## Podfile

```ruby
# ios/Podfile, before any target block
$RNFirebaseDisableSPM = true      # required
$RNFirebaseAsStaticFramework = true
```

`$RNFirebaseDisableSPM` is **required**, and `pod install` refuses to run without it. Firebase has to come from CocoaPods so that this package and react-native-firebase share one `FirebaseCore`. Why: [ios architecture](../internals/ios-architecture.md).

`$FirebaseSDKVersion` overrides the Firebase version if you need to pin it yourself. By default it is read from react-native-firebase's own `package.json`, so there is one source of truth.

Linkage is free: static and dynamic both work.

## Gradle

Nothing is required. To keep your app in charge of the Firebase version:

```gradle
// android/build.gradle
ext {
  firebaseBomVersion = "34.16.0"
  // also honoured: kotlinxCoroutinesVersion, kotlinxSerializationVersion,
  // minSdkVersion, compileSdkVersion
}
```

## AppDelegate

Required on Apple platforms by react-native-firebase, and this package fails with `not-configured` without it:

```swift
import FirebaseCore
// inside didFinishLaunchingWithOptions
FirebaseApp.configure()
```

`GoogleService-Info.plist` must be a **member of the app target**, not merely present in the folder.

## Instance settings

```ts
getSqlConnect(
  { connector, location, serviceId },
  {
    appName: '[DEFAULT]',
    host: undefined,
    sslEnabled: true,
    cacheSettings: { storage: 'persistent', maxAge: 0 },
  },
)
```

| Setting | Default | Notes |
| --- | --- | --- |
| `appName` | `[DEFAULT]` | must already be initialised by react-native-firebase |
| `host` | the Firebase backend | for a custom endpoint |
| `sslEnabled` | `true` | |
| `cacheSettings.storage` | `'persistent'` | on disk, survives restarts |
| `cacheSettings.maxAge` | `0` | see [the trap](../guides/03-caching.md#the-trap-in-maxage) |

Settings are locked when the instance is created; the native SDKs do not allow changing them afterwards.

## Pinned versions

Read from `packages/rn-sql-connect/package.json`, under `sdkVersions`:

| | Version |
| --- | --- |
| Apple Data Connect SDK, vendored | 11.12.5 |
| grpc-swift, via Swift Package Manager | 1.27.1 |
| Firebase Apple SDK, via CocoaPods | follows react-native-firebase |
| Firebase Android BoM | 34.16.0 |
| iOS deployment target | 15.0 |
| Android minSdk | 23 |

## Debug flags

```ts
globalThis.RNSqlConnectDebug = true   // logs every native call and its result
```

---

See also: [getting started](../guides/01-getting-started.md) | [API reference](api.md)
