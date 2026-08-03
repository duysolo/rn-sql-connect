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
[SMOKE] PASS mutation :: created 331a6bcb7d194f71ae114fc4f78d0606
[SMOKE] PASS query SERVER_ONLY :: source=server title=Dune
[SMOKE] PASS int64 fidelity :: expected 9007199254740993, got 9007199254740993
[SMOKE] PASS uuid fidelity :: id=331a6bcb7d194f71ae114fc4f78d0606
[SMOKE] PASS nested Any scalar :: {"nested":{"deep":[1,2,null,"x"]}}
[SMOKE] PASS query CACHE_ONLY :: source=cache
[SMOKE] PASS realtime subscription :: updates=[5,3]
[SMOKE] PASS diagnostics :: {"configured":true,"activeSubscriptions":0,...}
[SMOKE] PASS error mapping :: not-found: NOT_FOUND: operation "NoSuchOperation" not found
[SMOKE] RESULT 9/9 passed
```

For iOS:

```sh
cd example/ios && USE_FRAMEWORKS=dynamic bundle exec pod install && cd -
npm run example:ios
xcrun simctl spawn booted log show --last 2m --predicate 'eventMessage CONTAINS "[SMOKE]"' --style compact
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

## Adding an operation

1. Edit `example/dataconnect/connector/operations.gql`.
2. The running emulator picks it up and regenerates `example/generated`.
3. Add a step to `example/src/smoke.ts`.

No native rebuild. Operations cross the bridge by name, which is the point of the generic design.

## Troubleshooting

**`Could not find @react-native/gradle-plugin`**: npm workspaces hoist to the repository root, so `example/android/settings.gradle` points one level higher than the React Native template does. Run `npm install` at the root.

**`pod install` fails complaining about static linkage**: that is the guard working. See [ios-spm.md](ios-spm.md).

**Metro resolves two copies of React**: `example/metro.config.js` sets `disableHierarchicalLookup` and lists both `node_modules` folders. Keep it that way.

**Emulator port 9399 in use**: an earlier run is still alive. `lsof -ti:9399 | xargs kill`.
