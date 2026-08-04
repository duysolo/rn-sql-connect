# Releasing to npm

Two packages ship from this repo, independently:

| Package | What it is |
| --- | --- |
| `rn-sql-connect` | the library, including the vendored Apple SDK |
| `rn-sql-connect-codegen` | the generator, a devDependency for consumers |

Both are public and unscoped. Names were free at the time of writing.

## Before the first publish

```sh
npm login
npm whoami        # should print your npm username
```

Enable two-factor authentication on the npm account. For a package that ships native code, an account takeover is a supply-chain problem, not just an inconvenience.

## The checklist

Everything here is enforced by CI already, so this is about not publishing from a dirty tree.

```sh
git status                      # clean, on main, pushed
npm test                        # 67 tests
npm run lint
npm run typecheck
npm run vendor:check            # vendored Apple SDK matches its pinned tag
node scripts/codegen-roundtrip.mjs
```

Then confirm what would actually ship:

```sh
cd packages/rn-sql-connect && npm pack --dry-run
```

Look for, in order of how badly their absence breaks a consumer:

| Must be present | Why |
| --- | --- |
| `ios/vendor/FirebaseDataConnect/**` | 52 Swift files. Without them iOS does not compile at all |
| `RnSqlConnect.podspec` | no pod, no iOS |
| `android/**` | no Gradle module, no Android |
| `dist/module`, `dist/typescript` | the built JavaScript and types |
| `README.md`, `LICENSE` | the npm page and the licence terms |

`README.md` is generated at pack time from the repository README, with relative links rewritten to absolute GitHub URLs, and is gitignored. Do not commit it.

## Publishing

```sh
# the library
cd packages/rn-sql-connect
npm version patch          # or minor, or major
npm publish

# the generator, when it changed
cd ../rn-sql-connect-codegen
npm version patch
npm publish
```

`prepare` builds automatically before packing, so a stale `dist` cannot ship.

While the package is pre-release, publish under a tag so nobody installs it by accident:

```sh
npm publish --tag next
```

Consumers then opt in with `npm install rn-sql-connect@next`, and `npm install rn-sql-connect` keeps resolving to the last stable release. Promote later:

```sh
npm dist-tag add rn-sql-connect@0.2.0 latest
```

## Versioning

Semver, with one repo-specific rule: **a change of the vendored Apple SDK version is at least a minor bump**, even if no JavaScript changed. It changes the native code a consumer compiles.

| Change | Bump |
| --- | --- |
| JavaScript-only fix | patch |
| new option or export, backwards compatible | minor |
| vendored SDK version, Firebase BoM, minimum React Native | minor at least |
| a required Podfile or Gradle change for consumers | major |

## After publishing

```sh
git push --follow-tags
npm view rn-sql-connect
```

Then install it into a scratch app and run through [getting started](../guides/01-getting-started.md) exactly as written. Publishing is the one moment where the instructions get read literally, and a missing step shows up immediately.

## If something is wrong

`npm unpublish` is only allowed within 72 hours and breaks anyone who already installed. Prefer moving forward:

```sh
npm deprecate rn-sql-connect@0.1.0 "Broken iOS build, use 0.1.1"
npm publish        # the fix, as a new version
```

---

See also: [Local testing](local-testing.md) | [Configuration](../reference/configuration.md#pinned-versions)
