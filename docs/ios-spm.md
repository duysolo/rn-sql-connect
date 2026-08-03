# iOS: why Swift Package Manager, and why dynamic linkage

## The short version

`FirebaseDataConnect` has no CocoaPods spec and will never get one. It ships from a separate repository, [firebase/data-connect-ios-sdk](https://github.com/firebase/data-connect-ios-sdk), through Swift Package Manager only. Firebase stops publishing new versions to CocoaPods in **October 2026**, and the CocoaPods specs repo becomes read-only in **December 2026**.

That leaves exactly one working configuration for an app that uses both `@react-native-firebase` and this package:

```ruby
# ios/Podfile
use_frameworks! :linkage => :dynamic
```

with `@react-native-firebase/app` **26.1.0 or newer**, which resolves Firebase through SPM by default.

## Why static linkage cannot work

firebase-ios-sdk's `Package.swift` declares every product as `.library(type: .dynamic)`. Under `use_frameworks! :linkage => :static`, each pod that resolves Firebase through SPM statically embeds its own copy of those frameworks. The result is duplicate symbols at link time.

react-native-firebase reached the same conclusion and raises during `pod install` instead of letting the build fail later. This package does the same, in `RnSqlConnect.podspec`.

There is no combination of build settings that avoids this. The alternatives are:

1. Move the app to dynamic linkage. This is the supported path, and it is where every Firebase-using iOS app has to end up anyway.
2. Keep CocoaPods by setting `$RNFirebaseDisableSPM = true`. Firebase then comes from pods, but `FirebaseDataConnect` is unavailable, so **rn-sql-connect cannot be installed on iOS in that mode**.

## How the pieces fit together

```
Pods project
├── RNFBApp        -> SPM: firebase-ios-sdk (FirebaseCore, FirebaseInstallations)
├── RNFBAuth       -> SPM: firebase-ios-sdk (FirebaseAuth)
└── RnSqlConnect   -> SPM: data-connect-ios-sdk (FirebaseDataConnect)
                              └── depends on firebase-ios-sdk 11.5.0 ..< 13.0.0
```

Swift Package Manager resolves `firebase-ios-sdk` once for the whole graph, so both packages share one copy. That shared copy is what makes auth and App Check work without any bridging: the Data Connect SDK reads the current user from the same `FirebaseApp` that react-native-firebase configured.

This package pins Firebase through react-native-firebase's own `firebase_dependency()` helper rather than declaring its own version, so the version can only ever come from one place.

## Embedding

React Native's `spm_dependency` adds package products to pod targets but does not teach the app target to embed the resulting dynamic frameworks. react-native-firebase installs a build phase called `[RNFB] Embed Firebase SPM Frameworks` that copies every `*.framework` from the SPM build directory, matched by pattern rather than by name, so `FirebaseDataConnect.framework` is covered too.

Two things to verify when you first build:

1. `xcodebuild archive`, not just a Debug run. The Archive action puts SPM products in a different directory, and a missing framework only shows up as a crash on launch of a TestFlight build.
2. `SourcePackages/workspace-state.json` should list `firebase-ios-sdk` exactly once.

## Migrating an app that is on static linkage today

Do it in two steps, so each one has a single variable:

1. Upgrade `@react-native-firebase/*` to 26.1.0 while keeping CocoaPods and static linkage (`$RNFirebaseDisableSPM = true`). React Native Firebase 26 moved its modules to TurboModules, which is the risky part; isolate it.
2. Remove `$RNFirebaseDisableSPM`, switch to `:linkage => :dynamic`, and add rn-sql-connect.

Things to look at during step 2:

- Pods that are forced to static in a `pre_install` hook. Mixing a static library into a dynamic-frameworks target is where CocoaPods reports "transitive dependencies that include statically linked binaries".
- `$RNFirebaseAsStaticFramework`. It is meaningless once Firebase is no longer a pod; remove it.
- `RCT_USE_PREBUILT_RNCORE`. If it was disabled because react-native-firebase could not resolve `#import <React/...>`, try re-enabling it after the upgrade. Prebuilt React collapses around 65 React pods into one xcframework, which matters a lot when every pod is a dynamic framework.
- Cold start time and IPA size, measured before and after on the oldest device you support.

## Known issue: FirebaseCore is linked more than once (blocks iOS today)

Status: **iOS is not usable yet**. Android is unaffected and fully working.

### What happens

The example app builds and launches, the TurboModule loads, and the Swift code runs. Every Data Connect call then fails with:

```
not-configured: Firebase app "[DEFAULT]" is not configured.
```

even though `AppDelegate` calls `FirebaseApp.configure()` at launch and the crash you get from a malformed `GoogleService-Info.plist` proves that call really runs.

### Why

The runtime says it plainly:

```
objc[94618]: Class FIRApp is implemented in both
  .../PackageFrameworks/FirebaseCore_..._PackageProduct.framework
  and .../RnSqlConnect.framework
objc[94618]: Class FIRApp is implemented in both
  .../PackageFrameworks/FirebaseCore_..._PackageProduct.framework
  and .../RNFBApp.framework
```

Three copies of FirebaseCore end up in one process:

1. the Swift Package product built as a dynamic framework,
2. a static copy inside `RNFBApp.framework`,
3. a static copy inside `RnSqlConnect.framework`.

Xcode links a Swift Package **library** product statically into each binary that depends on it, so every pod that pulls a Firebase product gets its own copy. The Objective-C runtime keeps one `FIRApp` class and warns about the rest, but each copy carries its own file-scope state, including the registry of configured apps. `FirebaseApp.configure()` therefore registers into one copy while `FirebaseApp.app()` reads another and finds nothing.

Removing `firebase_dependency(...)` from this package's podspec, which is where it stands now, drops the redundant declaration but does not fix it: `FirebaseDataConnect` itself depends on `FirebaseCore`, so the static copy still lands in `RnSqlConnect.framework`.

### Why this matters beyond the error message

Even if the copy this package uses were configured on its own, `FirebaseAuth` would be split the same way. Data Connect would read a signed-in user from a copy that react-native-firebase never signed into, and `@auth(USER)` operations would fail while `@auth(PUBLIC)` ones worked. That failure mode is quiet, which is worse than the loud error we have now. So this package deliberately does **not** work around the problem by configuring its own copy.

### Where the fix belongs

Upstream, in react-native-firebase's SPM integration, which shipped in 26.1.0 on 2026-08-03, the same day this was found. Firebase products need to reach every pod as the shared dynamic framework rather than as a per-pod static copy.

Reported with this reproduction: **[invertase/react-native-firebase#9140](https://github.com/invertase/react-native-firebase/issues/9140)**.

Two workarounds were tried here and neither holds up:

- Building this pod as a static framework so it merges into the app binary. It then has to link the whole transitive Swift Package closure itself, starting with `GULAppEnvironmentUtil`, which is not something a consumer should have to mirror by hand.
- Adding `FirebaseDataConnect` to the app target from the example's `post_install`, mirroring what `rnfirebase_add_spm_core_to_app_target` does for FirebaseCore. This still failed to link, with missing gRPC symbols.

Until the upstream direction is settled:

- **Android**: fully working, no action needed.
- **iOS**: blocked. Do not ship it.
