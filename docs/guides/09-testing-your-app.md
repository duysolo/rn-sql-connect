# Testing your app

How to test code that calls this package, without a device in the loop.

## Mock the module, not the native layer

```ts
jest.mock('rn-sql-connect', () => ({
  getSqlConnect: () => ({ key: 'test' }),
  executeQuery: jest.fn().mockResolvedValue({ data: { movies: [] }, source: 'server' }),
  executeMutation: jest.fn().mockResolvedValue({ data: {} }),
  subscribe: jest.fn(() => () => {}),
  getDiagnostics: jest.fn().mockResolvedValue({ configured: true, activeSubscriptions: 0 }),
  QueryFetchPolicy: {
    PREFER_CACHE: 'PREFER_CACHE',
    CACHE_ONLY: 'CACHE_ONLY',
    SERVER_ONLY: 'SERVER_ONLY',
  },
  SqlConnectError: class extends Error {},
}))
```

Mocking at this level keeps your tests about your data layer. Reaching further down, into the TurboModule, only tests this package.

## Cases worth covering in your own tests

| Case | Why |
| --- | --- |
| `source: 'cache'` on a screen that must be fresh | catches a fetch policy that was loosened later |
| an `unauthenticated` rejection | the sign-in redirect path is easy to leave untested |
| `partial-error` with `partialData` | decides whether your screen renders or refuses |
| an `Int64` field | catches a `Number()` conversion someone added for convenience |

## Testing the real native path

That needs the example app and the Data Connect emulator, no Firebase project required: [local testing](../contributing/local-testing.md).

## Run a minified Android build before you ship

Once per release, install the actual release APK and open a screen that reads data. Not the debug build - a different one.

Debug builds are not minified, so they never exercise the code path where R8 has renamed things. The Data Connect SDK resolves protobuf fields by name at runtime, and this package resolves Firebase Auth by name too. Both fail silently under a rename, and both fail *only* in a release build. This package carries the ProGuard rules that keep them working, but a rule can be undone by an app's own configuration, and the only way to know is to run it.

The cheapest useful check is any screen that performs one query. If it renders, the reflective paths resolved.

If it does not, both failure signatures are in [troubleshooting](../troubleshooting.md#field-kind_-for--not-found-known-fields-are).

---

Next: [Migrating from the web SDK](08-migrating-from-the-web-sdk.md) | [Troubleshooting](../troubleshooting.md)
