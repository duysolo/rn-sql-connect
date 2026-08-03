import { emitIndex } from '../emit'
import { CodegenError, extractTypes, parseEsm } from '../parse'

// Shaped after a real SDK produced by `firebase dataconnect:sdk:generate`
// (firebase-tools 15.x). If the CLI ever changes this shape the parser must
// fail loudly rather than emit a partial SDK, which is what the last group of
// tests checks.
const ESM = `import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'tramev',
  service: 'estations-io-service',
  location: 'asia-southeast1'
};

export const listPublicServerConfigurationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListPublicServerConfigurations');
}
listPublicServerConfigurationsRef.operationName = 'ListPublicServerConfigurations';

export function listPublicServerConfigurations(dcOrOptions, options) {
  const { dc: dcInstance, vars: inputOpts} = validateArgs(connectorConfig, dcOrOptions, options, true);
  return executeQuery(listPublicServerConfigurationsRef(dcInstance), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}

export const getArticleBySlugRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetArticleBySlug', inputVars);
}
getArticleBySlugRef.operationName = 'GetArticleBySlug';

export const createArticleDcRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateArticleDc', inputVars);
}
createArticleDcRef.operationName = 'CreateArticleDc';

export const listNewsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListNews', inputVars);
}
listNewsRef.operationName = 'ListNews';
`

const DECLARATION = `import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type UUIDString = string;
export type TimestampString = string;

export interface GetArticleBySlugData {
  article?: {
    id: UUIDString;
    title: string;
  } & Article_Key;
}

export interface GetArticleBySlugVariables {
  slug: string;
}

export interface GetArticleBySlugRef {
  (dc: DataConnect, vars: GetArticleBySlugVariables): QueryRef<GetArticleBySlugData, GetArticleBySlugVariables>;
  operationName: string;
}
export const getArticleBySlugRef: GetArticleBySlugRef;

export function getArticleBySlug(vars: GetArticleBySlugVariables): QueryPromise<GetArticleBySlugData, GetArticleBySlugVariables>;

export interface Article_Key {
  id: UUIDString;
  __typename?: 'Article_Key';
}

interface ListNewsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListNewsVariables): QueryRef<ListNewsData, ListNewsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars?: ListNewsVariables): QueryRef<ListNewsData, ListNewsVariables>;
  operationName: string;
}

interface CreateArticleDcRef {
  (vars: CreateArticleDcVariables): MutationRef<CreateArticleDcData, CreateArticleDcVariables>;
  operationName: string;
}
`

describe('parseEsm', () => {
  const parsed = parseEsm(ESM)

  it('reads the connector config', () => {
    expect(parsed.connectorConfig).toEqual({
      connector: 'tramev',
      service: 'estations-io-service',
      location: 'asia-southeast1',
    })
  })

  it('finds every operation with its server side name', () => {
    expect(parsed.operations.map(operation => operation.operationName)).toEqual([
      'ListPublicServerConfigurations',
      'GetArticleBySlug',
      'CreateArticleDc',
      'ListNews',
    ])
  })

  it('separates queries from mutations', () => {
    const kinds = Object.fromEntries(
      parsed.operations.map(operation => [operation.name, operation.kind]),
    )
    expect(kinds).toEqual({
      listPublicServerConfigurations: 'query',
      getArticleBySlug: 'query',
      createArticleDc: 'mutation',
      listNews: 'query',
    })
  })

  it('detects which operations take variables and whether they are required', () => {
    const byName = Object.fromEntries(parsed.operations.map(operation => [operation.name, operation]))
    expect(byName.listPublicServerConfigurations.hasVariables).toBe(false)
    expect(byName.getArticleBySlug.hasVariables).toBe(true)
    expect(byName.getArticleBySlug.variablesOptional).toBe(false)
    // No "required" flag in validateArgs means the variables can be omitted.
    expect(byName.listNews.variablesOptional).toBe(true)
  })

  it('fails loudly when the generated format no longer matches', () => {
    expect(() => parseEsm('export const nothing = 1')).toThrow(CodegenError)
    expect(() =>
      parseEsm(`export const connectorConfig = { connector: 'a', service: 'b', location: 'c' };
export const brokenRef = (dc) => {
  return queryRef(dcInstance, 'Broken');
}
`),
    ).toThrow(/operationName/)
  })
})

describe('extractTypes', () => {
  const types = extractTypes(DECLARATION)

  it('keeps the data and variables interfaces', () => {
    expect(types).toContain('export interface GetArticleBySlugData')
    expect(types).toContain('export interface GetArticleBySlugVariables')
    expect(types).toContain('export interface Article_Key')
    expect(types).toContain('export type UUIDString')
  })

  it('drops everything that would drag the firebase package back in', () => {
    expect(types).not.toContain("from 'firebase/data-connect'")
    expect(types).not.toContain('QueryRef')
    expect(types).not.toContain('MutationRef')
    expect(types).not.toContain('export function getArticleBySlug')
    expect(types).not.toContain('export const connectorConfig')
  })

  // The CLI emits some Ref interfaces without `export`. Missing those left web
  // SDK types in the output, which only failed later when the emitted SDK was
  // compiled.
  it('drops Ref interfaces that are declared without export', () => {
    expect(types).not.toContain('interface ListNewsRef')
    expect(types).not.toContain('interface CreateArticleDcRef')
  })

  it('refuses to emit types that still reference the web SDK', () => {
    const leaky = `export interface Leaky {
  ref: QueryRef<string, string>;
}
`
    expect(() => extractTypes(leaky)).toThrow(/still reference web SDK types/)
  })
})

describe('emitIndex', () => {
  const output = emitIndex({ ...parseEsm(ESM), types: extractTypes(DECLARATION) })

  it('keeps the same function names as the web SDK, so migrating is an import change', () => {
    expect(output).toContain('export function listPublicServerConfigurations(')
    expect(output).toContain('export function getArticleBySlug(')
    expect(output).toContain('export function createArticleDc(')
  })

  it('passes the server side operation name through', () => {
    expect(output).toContain("'ListPublicServerConfigurations'")
    expect(output).toContain("executeMutation<CreateArticleDcData, CreateArticleDcVariables>")
  })

  it('emits a subscribe helper for queries only', () => {
    expect(output).toContain('export function subscribeGetArticleBySlug(')
    expect(output).not.toContain('export function subscribeCreateArticleDc(')
  })

  it('marks optional variables as optional', () => {
    expect(output).toContain('vars?: ListNewsVariables')
    expect(output).toContain('vars: GetArticleBySlugVariables')
  })

  it('writes the connector config with SDK field names', () => {
    expect(output).toContain("serviceId: 'estations-io-service'")
  })
})
