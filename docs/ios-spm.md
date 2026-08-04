# iOS: why the Apple SDK is vendored

## The short version

`FirebaseDataConnect` has no CocoaPods spec and will never get one. It ships from [firebase/data-connect-ios-sdk](https://github.com/firebase/data-connect-ios-sdk) through Swift Package Manager only, and Firebase stops publishing to CocoaPods in October 2026.

Consuming it through Swift Package Manager does not work in a React Native app, for a reason that has nothing to do with this package. So the Apple SDK sources are **vendored** into `ios/vendor/FirebaseDataConnect`, Firebase comes from CocoaPods, and only `grpc-swift` stays on Swift Package Manager.

What that requires of an app:

```ruby
# ios/Podfile, before any target block
$RNFirebaseDisableSPM = true
$RNFirebaseAsStaticFramework = true
```

Static linkage is fine. Dynamic works too. What matters is that react-native-firebase resolves Firebase through CocoaPods, so that both packages use the same copy. The podspec refuses to install otherwise.

## Why Swift Package Manager does not work here

`firebase-ios-sdk` declares its products with the automatic type:

```swift
.library(name: "FirebaseCore", targets: ["FirebaseCore"]),
```

```sh
$ grep -c 'type: .dynamic' Package.swift   # firebase-ios-sdk 12.17.0
0
```

Swift Package Manager links an automatic library product **statically into every binary that depends on it**. In a React Native app each pod is its own framework, so every pod that references a Firebase product gets a private copy of `FirebaseCore`. The Objective-C runtime keeps one `FIRApp` class and warns about the rest:

```
objc[94618]: Class FIRApp is implemented in both
  .../PackageFrameworks/FirebaseCore_..._PackageProduct.framework
  and .../RnSqlConnect.framework
```

Each copy carries its own registry of configured apps, so `FirebaseApp.configure()` at launch is invisible to the copy this package would run against, and every call fails with `not-configured`.

A react-native-firebase maintainer confirmed this in [invertase/react-native-firebase#9140](https://github.com/invertase/react-native-firebase/issues/9140) and ruled out the workarounds:

| react-native-firebase | Other native dependency | Shared FirebaseCore |
| --- | --- | --- |
| SPM | SPM via `spm_dependency` | No |
| SPM | CocoaPods Firebase pods | No, dual resolution |
| CocoaPods (`$RNFirebaseDisableSPM = true`) | CocoaPods Firebase pods | **Yes** |

Linking the product onto the app target, which this package tried first, does not help either: that exists so the app target can call `FirebaseApp.configure()`, not to give pods a shared instance. Building this pod as a static framework does not help either, it just moves the problem and forces the pod to mirror the whole transitive Swift Package closure by hand.

The long-term fix is upstream in firebase-ios-sdk, whose products would need to be declared `.library(type: .dynamic)`.

## What vendoring buys, and what it costs

Sharing one Firebase instance is not a nicety. It is what makes `@auth(USER)` operations work at all: Data Connect reads the signed-in user and the App Check token off the `FirebaseApp` that react-native-firebase configured. A private copy would leave queries working while auth quietly failed, which is the worst failure shape available.

The cost is drift. The vendored copy is pinned to a tag and CI enforces it:

```sh
npm run vendor:check        # fails if the tree differs from the pinned tag plus recorded patches
npm run vendor:sync         # refresh to the pinned tag
node scripts/sync-vendored-dataconnect.mjs --tag 11.13.0   # move to a new tag
```

One patch is applied on top of upstream and asserted by the sync script, so an upstream change that invalidates it fails loudly rather than turning into a confusing compile error:

| File | Patch | Why |
| --- | --- | --- |
| `Internal/Version.swift` | `import GoogleUtilities_Environment` becomes a `canImport` pair | Swift Package Manager and CocoaPods disagree on the module name for the same code |

The vendored sources keep their Apache-2.0 headers and the upstream `LICENSE` file.

## Dependency map

```
RnSqlConnect (pod)
├── ios/vendor/FirebaseDataConnect   vendored, pinned to 11.12.5
├── CocoaPods
│   ├── Firebase/CoreOnly            same copy react-native-firebase uses
│   ├── FirebaseAuth
│   ├── FirebaseAppCheckInterop
│   ├── FirebaseCoreExtension
│   └── GoogleUtilities/Environment
└── Swift Package Manager
    └── grpc-swift 1.27.1            no CocoaPods distribution, nothing else links it
```

`SQLite3` comes from the system, so the on-disk cache needs no dependency of its own.

The Firebase version is read from react-native-firebase's own `package.json` at `pod install` time, so it can only ever come from one place. `$FirebaseSDKVersion` overrides it, the same escape hatch react-native-firebase documents.

## Verified

The example app runs the full smoke suite on a simulator against the Data Connect emulator, 16 of 16 passing, including auth-gated operations, a realtime subscription, the on-disk cache, and every scalar type. See [local-testing.md](local-testing.md).

## When this can be undone

If firebase-ios-sdk ever declares dynamic products, the Swift Package route becomes viable and the vendored copy can be dropped. Until then, note that Firebase stops publishing to CocoaPods in October 2026: existing pod versions stay installable, so this keeps working, but the Firebase side stops receiving updates at that point. That is the deadline for revisiting this, not a reason to avoid it today.
