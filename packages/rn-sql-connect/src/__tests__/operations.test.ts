import { createNativeMock, type NativeMock } from './nativeMock'

let native: NativeMock = createNativeMock()

jest.mock('../specs/NativeRnSqlConnect', () => ({
  __esModule: true,
  get default() {
    return native
  },
}))

import { SqlConnectError } from '../core/errors'
import {
  connectSqlConnectEmulator,
  getSqlConnect,
  resetInstancesForTests,
  terminate,
} from '../core/instance'
import { resetNativeModuleCache } from '../core/native'
import { executeMutation, executeQuery } from '../core/operations'
import { QueryFetchPolicy } from '../core/types'

const CONFIG = { connector: 'tramev', location: 'asia-southeast1', serviceId: 'estations-io-service' }

beforeEach(() => {
  native = createNativeMock()
  resetNativeModuleCache()
  resetInstancesForTests()
})

describe('getSqlConnect', () => {
  it('returns the same handle for the same connector', () => {
    expect(getSqlConnect(CONFIG)).toBe(getSqlConnect(CONFIG))
  })

  it('keys instances by app, service, location and connector', () => {
    const a = getSqlConnect(CONFIG)
    const b = getSqlConnect({ ...CONFIG, connector: 'core' })
    expect(a.key).not.toBe(b.key)
    expect(a.key).toBe('[DEFAULT]|estations-io-service|asia-southeast1|tramev')
  })

  it('rejects a second call that changes settings, instead of ignoring them', () => {
    getSqlConnect(CONFIG, { cacheSettings: { maxAge: '5m' } })
    expect(() => getSqlConnect(CONFIG, { cacheSettings: { maxAge: '10m' } })).toThrow(
      SqlConnectError,
    )
  })

  it('requires a complete connector config', () => {
    expect(() => getSqlConnect({ connector: '', location: 'x', serviceId: 'y' })).toThrow(TypeError)
  })
})

describe('executeQuery', () => {
  it('configures the native instance exactly once, even with concurrent calls', async () => {
    const dc = getSqlConnect(CONFIG)
    await Promise.all([
      executeQuery(dc, 'ListNews'),
      executeQuery(dc, 'ListNews'),
      executeQuery(dc, 'GetProfile'),
    ])
    expect(native.__calls.filter(call => call.method === 'configure')).toHaveLength(1)
  })

  it('sends variables as JSON and defaults to PREFER_CACHE', async () => {
    const dc = getSqlConnect(CONFIG)
    await executeQuery(dc, 'ListNews', { limit: 20 })
    const call = native.__calls.find(entry => entry.method === 'executeQuery')
    expect(call?.args).toEqual([dc.key, 'ListNews', '{"limit":20}', QueryFetchPolicy.PREFER_CACHE])
  })

  it('passes the requested fetch policy through', async () => {
    const dc = getSqlConnect(CONFIG)
    await executeQuery(dc, 'ListNews', undefined, { fetchPolicy: QueryFetchPolicy.SERVER_ONLY })
    const call = native.__calls.find(entry => entry.method === 'executeQuery')
    expect(call?.args[3]).toBe('SERVER_ONLY')
  })

  it('reports the data source so callers can tell a cached read from a fresh one', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__queryResults.set(
      'ListNews',
      JSON.stringify({ data: { articles: [] }, source: 'cache' }),
    )
    const result = await executeQuery(dc, 'ListNews')
    expect(result).toEqual({ data: { articles: [] }, source: 'cache' })
  })

  it('keeps Int64 and UUID values as strings', async () => {
    const dc = getSqlConnect(CONFIG)
    const id = '0195f0a0-0000-7000-8000-000000000000'
    const big = '9007199254740993'
    native.__queryResults.set(
      'GetRow',
      JSON.stringify({ data: { id, total: big }, source: 'server' }),
    )
    const result = await executeQuery<{ id: string; total: string }>(dc, 'GetRow')
    expect(result.data.id).toBe(id)
    expect(result.data.total).toBe(big)
  })

  it('maps a native rejection into SqlConnectError with the structured detail', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__failNext = {
      code: 'unauthorized',
      message: 'permission denied',
      details: JSON.stringify({
        code: 'unauthorized',
        message: 'permission denied',
        graphQLErrors: [{ message: 'auth level USER required', path: ['user'] }],
        nativeCode: 'DataConnectOperationException',
      }),
    }
    await expect(executeQuery(dc, 'GetProfile')).rejects.toMatchObject({
      name: 'SqlConnectError',
      code: 'unauthorized',
      operationName: 'GetProfile',
      graphQLErrors: [{ message: 'auth level USER required', path: ['user'] }],
    })
  })

  it('surfaces partial errors as errors while keeping the data that did resolve', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__queryResults.set(
      'ListNews',
      JSON.stringify({
        error: {
          code: 'partial-error',
          message: 'partial failure',
          graphQLErrors: [{ message: 'field failed', path: ['articles', 2, 'title'] }],
          partialData: { articles: [{ id: '1' }] },
        },
      }),
    )
    await expect(executeQuery(dc, 'ListNews')).rejects.toMatchObject({
      code: 'partial-error',
      partialData: { articles: [{ id: '1' }] },
    })
  })

  /**
   * A cold cache used to come back as a successful result carrying `data: null`,
   * under a type saying `data` is always present. Call sites then failed inside
   * their own code with a TypeError that pointed nowhere near the cause. Apple
   * platforms did that; Android threw instead, so the two disagreed as well.
   */
  it('reports a cold CACHE_ONLY read as cache-miss rather than a result with no data', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__queryResults.set('ListNews', JSON.stringify({ data: null, source: 'cache' }))
    await expect(
      executeQuery(dc, 'ListNews', undefined, { fetchPolicy: QueryFetchPolicy.CACHE_ONLY }),
    ).rejects.toMatchObject({ code: 'cache-miss', operationName: 'ListNews' })
  })

  it('mentions the maxAge default in the cache-miss message, since that is the usual cause', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__queryResults.set('ListNews', JSON.stringify({ data: null, source: 'cache' }))
    await expect(
      executeQuery(dc, 'ListNews', undefined, { fetchPolicy: QueryFetchPolicy.CACHE_ONLY }),
    ).rejects.toThrow(/maxAge defaults\s+to 0/)
  })

  it('treats missing data on a server read as internal, not as a cache miss', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__queryResults.set('ListNews', JSON.stringify({ data: null, source: 'server' }))
    await expect(
      executeQuery(dc, 'ListNews', undefined, { fetchPolicy: QueryFetchPolicy.SERVER_ONLY }),
    ).rejects.toMatchObject({ code: 'internal' })
  })

  it('rejects a mutation that comes back without data', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__queryResults.set('CreateReview', JSON.stringify({ data: null }))
    await expect(executeMutation(dc, 'CreateReview')).rejects.toMatchObject({ code: 'internal' })
  })

  it('retries configure after it failed once, instead of caching the failure', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__failNext = { code: 'internal', message: 'no firebase app' }
    await expect(executeQuery(dc, 'ListNews')).rejects.toThrow()
    await expect(executeQuery(dc, 'ListNews')).resolves.toBeDefined()
    expect(native.__calls.filter(call => call.method === 'configure')).toHaveLength(2)
  })
})

describe('executeMutation', () => {
  it('drops undefined variables but keeps explicit nulls', async () => {
    const dc = getSqlConnect(CONFIG)
    await executeMutation(dc, 'UpsertProfile', { name: 'A', photoUrl: null, bio: undefined })
    const call = native.__calls.find(entry => entry.method === 'executeMutation')
    expect(call?.args[2]).toBe('{"name":"A","photoUrl":null}')
  })
})

describe('connectSqlConnectEmulator', () => {
  it('applies before the first operation', async () => {
    const dc = getSqlConnect(CONFIG)
    connectSqlConnectEmulator(dc, { host: '127.0.0.1', port: 9399 })
    await executeQuery(dc, 'ListNews')
    const methods = native.__calls.map(call => call.method)
    expect(methods.indexOf('useEmulator')).toBeLessThan(methods.indexOf('executeQuery'))
  })

  it('refuses to switch after an operation already ran', async () => {
    const dc = getSqlConnect(CONFIG)
    await executeQuery(dc, 'ListNews')
    expect(() => connectSqlConnectEmulator(dc)).toThrow(SqlConnectError)
  })

  it('refuses to switch while the first operation is still in flight', async () => {
    const dc = getSqlConnect(CONFIG)
    const inFlight = executeQuery(dc, 'ListNews')
    // Accepting this would set an emulator that configure() already skipped.
    expect(() => connectSqlConnectEmulator(dc)).toThrow(SqlConnectError)
    await inFlight
  })
})

describe('terminate', () => {
  it('closes native and forgets the handle', async () => {
    const dc = getSqlConnect(CONFIG)
    await executeQuery(dc, 'ListNews')
    await terminate(dc)
    expect(native.__calls.some(call => call.method === 'terminate')).toBe(true)
    expect(getSqlConnect(CONFIG)).not.toBe(dc)
  })

  it('does not call native for an instance that was never used', async () => {
    const dc = getSqlConnect(CONFIG)
    await terminate(dc)
    expect(native.__calls.some(call => call.method === 'terminate')).toBe(false)
  })
})
