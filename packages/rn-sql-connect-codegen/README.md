# rn-sql-connect-codegen

Generates typed TypeScript wrappers for [`rn-sql-connect`](https://www.npmjs.com/package/rn-sql-connect) from the JavaScript SDK that `firebase dataconnect:sdk:generate` already produces.

```sh
npx rn-sql-connect-codegen --in vendor/dataconnect-generated/example --out src/dataconnect/example
```

```
rn-sql-connect-codegen: 55 operations (41 queries, 14 mutations) from connector "tramev"
  wrote src/dataconnect/example/types.ts
  wrote src/dataconnect/example/index.ts
```

The emitted functions keep the same names as the web SDK, so migrating a call site is a change of import path and nothing else. The output has no dependency on the `firebase` package, and the generator fails the whole run rather than emitting a partial SDK.

Full documentation: [code generation guide](https://github.com/duysolo/rn-sql-connect/blob/main/docs/guides/07-code-generation.md).

## License

Apache-2.0
