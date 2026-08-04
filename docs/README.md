# Documentation

| Document | Read it when |
| --- | --- |
| [getting-started.md](getting-started.md) | Setting the package up in an app, from install to first query |
| [api.md](api.md) | You need the exact signature, option or error code |
| [codegen.md](codegen.md) | You want typed wrappers instead of string operation names |
| [recipes.md](recipes.md) | Choosing a cache policy, wiring realtime, handling errors, migrating off the web SDK |
| [local-testing.md](local-testing.md) | Running everything against the emulator, with no Firebase project |
| [ios-spm.md](ios-spm.md) | Understanding why iOS is set up the way it is, or changing it |
| [troubleshooting.md](troubleshooting.md) | Something is broken and you want the answer, not the theory |

## The short version

Three things decide almost everything about using this package.

**Operations cross by name.** Adding an operation never requires a native rebuild. That is what the generic bridge buys, and why the code generator only emits TypeScript.

**Values cross as JSON text.** Data Connect encodes `Int64`, `UUID`, `Date` and `Timestamp` as strings, and a bridge map would coerce them. Keep `Int64` as a string in your own code too.

**Auth is not wired up, it is shared.** Data Connect reads the signed-in user from the same `FirebaseApp` that react-native-firebase configured. Everything about the iOS setup exists to protect that one property.
