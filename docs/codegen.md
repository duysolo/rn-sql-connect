# Typed SDK generation

Calling operations by name works, but you lose types. The generator produces TypeScript wrappers so that `listMoviesByGenre(dc, { genre })` is checked, autocompleted, and refuses wrong variables.

## Run it

```sh
npx rn-sql-connect-codegen --in <generated-js-sdk> --out <output-dir>
```

Example:

```sh
npx rn-sql-connect-codegen \
  --in vendor/dataconnect-generated/tramev \
  --out src/dataconnect/tramev
```

```
rn-sql-connect-codegen: 55 operations (41 queries, 14 mutations) from connector "tramev"
  wrote src/dataconnect/tramev/types.ts
  wrote src/dataconnect/tramev/index.ts
```

## What it reads

The **JavaScript SDK that `firebase dataconnect:sdk:generate` already produces**, the one with `index.d.ts` and `esm/index.esm.js` in it.

That is a deliberate choice over parsing `.gql` files. That bundle is the only artefact stating each operation's server-side name, it is produced by the same CLI version your project already runs, and it carries the GraphQL to TypeScript mapping that Firebase maintains. Parsing schema files would mean re-implementing that mapping and chasing every upstream change.

Concretely it means you keep running the Firebase generator as before, and this generator turns its output into something that talks to the native SDK.

## What it writes

Two files, no dependency on the `firebase` package:

```
src/dataconnect/tramev/
├── index.ts     connectorConfig, one function per operation, subscribe helpers
└── types.ts     the Data and Variables interfaces, copied and stripped
```

The function names are **identical to the web SDK's**, which makes migrating a call site a change of import path and nothing else:

```diff
-import { listPublicServerConfigurations } from '@dataconnect/tramev'
+import { listPublicServerConfigurations } from '@/src/dataconnect/tramev'
```

Signatures follow the same shape, with the instance passed explicitly:

```ts
// query, variables required
export function getArticleBySlug(
  dc: SqlConnect,
  vars: GetArticleBySlugVariables,
  options?: ExecuteQueryOptions,
): Promise<QueryResult<GetArticleBySlugData>>

// query, variables optional
export function listNews(
  dc: SqlConnect,
  vars?: ListNewsVariables,
  options?: ExecuteQueryOptions,
): Promise<QueryResult<ListNewsData>>

// query with no variables, instance optional
export function listPublicServerConfigurations(
  dc?: SqlConnect,
  options?: ExecuteQueryOptions,
): Promise<QueryResult<ListPublicServerConfigurationsData>>

// mutation
export function createArticleDc(
  dc: SqlConnect,
  vars: CreateArticleDcVariables,
): Promise<MutationResult<CreateArticleDcData>>
```

Every query also gets a subscribe helper:

```ts
export function subscribeGetArticleBySlug(
  dc: SqlConnect,
  vars: GetArticleBySlugVariables,
  observer?: SubscriptionObserver<GetArticleBySlugData>,
): Unsubscribe
```

And a default instance for the operations that do not need a custom one:

```ts
export const connectorConfig: ConnectorConfig = { connector: 'tramev', serviceId: '...', location: '...' }
export const defaultInstance = (): SqlConnect => getSqlConnect(connectorConfig)
```

## What it refuses to do

The generator fails the whole run rather than emitting something partial. A partial SDK is worse than none: it compiles, and the missing operation is found at runtime by a user.

It stops when:

- an operation has no matching `operationName` assignment,
- an operation is neither a query nor a mutation,
- no operations are found at all,
- the filtered types still reference a web SDK type such as `QueryRef` or `DataConnect`, which would mean the output needs the `firebase` package to compile.

That last check exists because it already caught a real bug: the Firebase CLI emits some `Ref` interfaces without `export`, and an earlier filter missed them, leaving web SDK types in the output.

## Keeping it honest in CI

```sh
node scripts/codegen-roundtrip.mjs
```

Generates from the checked-in fixture and compiles the result against the library. Unit tests cover the parser; this covers the part they cannot, which is that the emitted TypeScript actually compiles. Every generator bug found so far was of that kind.

## Verified against real connectors

The generator has been run over three connectors and the output compiled with `tsc --strict`:

| Connector | Operations |
| --- | --- |
| example, in this repo | 6 (3 queries, 3 mutations) |
| tramev | 55 (41 queries, 14 mutations) |
| core | 96 (62 queries, 34 mutations) |

## Suggested workflow

1. Keep generating the JavaScript SDK as you do today (`firebase dataconnect:sdk:generate`).
2. Add a script:

   ```json
   {
     "scripts": {
       "dc:codegen": "rn-sql-connect-codegen --in vendor/dataconnect-generated/tramev --out src/dataconnect/tramev"
     }
   }
   ```

3. Commit the output. It is generated, but committing it keeps the diff visible when the schema changes, which is often the first sign that a server change is about to reach the app.
4. Run it in CI on the same job that regenerates the Firebase SDK, so drift shows up as a diff rather than a runtime surprise.
