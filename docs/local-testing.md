# Testing locally

Nothing here needs a real Firebase project, a paid Apple account, or network access to Google. Everything runs against the Data Connect emulator, which brings up its own Postgres.

## What you need

| Tool | Why |
| --- | --- |
| Node 20+ | workspace and Metro |
| firebase-tools 15.14+ | Data Connect emulator, SDK generation |
| JDK 17 and the Android SDK with one AVD | Android |
| Xcode 15+ with a simulator, CocoaPods | iOS |

Postgres is **not** required. The emulator starts its own on 127.0.0.1:5432.

## The three loops

### 1. No device: unit tests and the generator

The fastest loop, a couple of seconds. Covers the whole JavaScript layer and the code generator.

```sh
npm test          # 67 tests
npm run lint
npm run typecheck
node scripts/codegen-roundtrip.mjs   # generates an SDK and compiles it
```

### 2. Emulator only: schema and operations

Checks that `example/dataconnect` is valid and that operations behave, without building an app.

```sh
npm run emulator
```

The emulator loads the schema, migrates its Postgres, deploys the connector, and regenerates `example/generated`. Call it directly to try an operation:

```sh
curl -s -X POST \
  'http://127.0.0.1:9399/v1beta/projects/demo-rn-sql-connect/locations/asia-southeast1/services/example/connectors/example:executeMutation' \
  -H 'Content-Type: application/json' \
  -d '{"operationName":"CreateMovie","variables":{"title":"Dune","genre":"Sci-Fi"}}'
```

Note the `v1beta` path. `v1` returns an empty body.

### 3. Device: the native layer

This is the only loop that proves the Kotlin and Swift code works. The example app runs a scripted smoke test on start and prints each step with a `[SMOKE]` prefix, so the result can be read from a terminal instead of by tapping through a screen.

```sh
npm run emulator             # terminal 1, leave running

npm run example:start        # terminal 2, Metro
npm run example:android      # terminal 3
```

Then read the result:

```sh
adb logcat -d | grep SMOKE
```

```
[SMOKE] PASS mutation :: created 088624ec24fa42349d11991b120dfe53
[SMOKE] PASS query SERVER_ONLY :: source=server title=Dune
[SMOKE] PASS int64 fidelity :: expected 9007199254740993, got 9007199254740993
[SMOKE] PASS uuid fidelity :: id=088624ec24fa42349d11991b120dfe53
[SMOKE] PASS timestamp fidelity :: got 2026-08-04T09:30:00.000000Z
[SMOKE] PASS date fidelity :: expected 2026-08-04, got 2026-08-04
[SMOKE] PASS float and boolean fidelity :: score=8.5 isFeatured=true
[SMOKE] PASS list fidelity :: tags=["sci-fi","desert"] scores=[3,5,8]
[SMOKE] PASS nested Any scalar :: {"nested":{"deep":[1,2,null,"x"]}}
[SMOKE] PASS query CACHE_ONLY :: source=cache
[SMOKE] PASS realtime subscription :: updates=[5,3]
[SMOKE] PASS auth gate blocks a signed-out caller :: unauthenticated: ...
[SMOKE] PASS auth USER operation with a signed-in user :: uid=RJNdz... reviews=1
[SMOKE] PASS native sees the signed-in user :: {"hasCurrentUser":true,"uid":"RJNdz..."}
[SMOKE] PASS diagnostics :: {"configured":true,"activeSubscriptions":0,...}
[SMOKE] PASS error mapping :: not-found: NOT_FOUND: operation "NoSuchOperation" not found
[SMOKE] RESULT 16/16 passed
```

For iOS:

```sh
cd example/ios && bundle exec pod install && cd -
npm run example:ios
```

The iOS console does not carry JavaScript `console.log` reliably, so read the result from the app screen or take a screenshot:

```sh
xcrun simctl io booted screenshot /tmp/smoke.png && open /tmp/smoke.png
```

## Reaching the emulator from a device

| Runtime | Host to use | Handled by |
| --- | --- | --- |
| Android emulator | `10.0.2.2` | the native SDK default, no host passed |
| iOS simulator | `127.0.0.1` | the native SDK default, no host passed |
| Physical device | your machine's LAN IP | pass it: `connectSqlConnectEmulator(dc, { host: '192.168.1.20' })` |

On Android, `adb reverse tcp:9399 tcp:9399` also works and is what the smoke run uses for Metro anyway.

## What each smoke step is actually checking

| Step | Why it matters |
| --- | --- |
| int64 fidelity | The reason this bridge passes JSON text. A bridge map would turn `9007199254740993` into `9007199254740992` and nobody would notice until an invoice was wrong. |
| nested Any scalar | Exercises the runtime-built serial descriptor on Android, including an explicit `null` inside an array. |
| CACHE_ONLY returning `source: cache` | Proves the persistent cache is configured, which is one of the two reasons for going native. |
| realtime subscription | Proves the stream, the JS-side dedupe, and the event bridge. Needs `@refresh` on the operation for anything beyond a primary-key lookup. |
| error mapping | Proves the platform-specific error taxonomy maps onto the shared codes. |
| timestamp and date fidelity | Timestamps are the most common non-trivial scalar in a real schema. The check compares the instant rather than the text, since the server normalises the format, so a timezone bug still fails. |
| auth steps | The reason this package exists. An `@auth(level: USER)` operation is refused while signed out, then accepted after signing in, with native reporting the same uid. Nothing bridges the token. |

**A trap the auth steps walked into first:** `@auth(level: USER)` rejects anonymous users. Signing in with `signInAnonymously` returns `unauthenticated` with `debug_details: "@auth(level: USER) doesn't allow anonymous users"`, even though the server received and verified the token. Operations that should accept anonymous callers need `@auth(level: USER_ANON)`. The smoke test signs in with email for that reason.

## Adding an operation

1. Edit `example/dataconnect/connector/operations.gql`.
2. The running emulator picks it up and regenerates `example/generated`.
3. Add a step to `example/src/smoke.ts`.

No native rebuild. Operations cross the bridge by name, which is the point of the generic design.

## Troubleshooting

**`Could not find @react-native/gradle-plugin`**: npm workspaces hoist to the repository root, so `example/android/settings.gradle` points one level higher than the React Native template does. Run `npm install` at the root.

**`pod install` fails saying react-native-firebase is using Swift Package Manager**: that is the guard working. Add `$RNFirebaseDisableSPM = true` to the Podfile. See [ios-spm.md](ios-spm.md).

**iOS says `not-configured`**: `AppDelegate` is missing `FirebaseApp.configure()`, or `GoogleService-Info.plist` is not a member of the app target. The example app has both; copy from there.

**Metro resolves two copies of React**: `example/metro.config.js` sets `disableHierarchicalLookup` and lists both `node_modules` folders. Keep it that way.

**Emulator port 9399 in use**: an earlier run is still alive. `lsof -ti:9399 | xargs kill`.
