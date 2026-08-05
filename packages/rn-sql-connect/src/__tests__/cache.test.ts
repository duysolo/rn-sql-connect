import { createNativeMock, type NativeMock } from './nativeMock'

let native: NativeMock = createNativeMock()

jest.mock('../specs/NativeRnSqlConnect', () => ({
  __esModule: true,
  get default() {
    return native
  },
}))

import { clearCache } from '../core/cache'
import { SqlConnectError } from '../core/errors'
import { getSqlConnect, resetInstancesForTests } from '../core/instance'
import { resetNativeModuleCache } from '../core/native'

const CONFIG = {
  connector: 'tramev',
  location: 'asia-southeast1',
  serviceId: 'estations-io-service',
}

beforeEach(() => {
  native = createNativeMock()
  resetNativeModuleCache()
  resetInstancesForTests()
})

describe('clearCache', () => {
  it('reports how many files were removed', async () => {
    native.__filesRemoved = 3
    await expect(clearCache()).resolves.toBe(3)
  })

  it('is app-wide: takes no instance and needs none to exist', async () => {
    await expect(clearCache()).resolves.toBe(0)
    expect(native.__calls).toEqual([{ method: 'clearCache', args: [] }])
  })

  /**
   * An empty cache and an unclearable one must not look alike. Callers reach for this while
   * erasing a signed-out user's data; swallowing the failure would report that erasure as done.
   */
  it('surfaces a native failure as SqlConnectError instead of resolving 0', async () => {
    native.__failNext = { code: 'internal', message: 'file is locked' }

    const error = await clearCache().then(
      () => undefined,
      (rejection: unknown) => rejection as SqlConnectError,
    )

    expect(error).toBeInstanceOf(SqlConnectError)
    expect(error?.code).toBe('internal')
    expect(error?.message).toContain('file is locked')
  })

  /**
   * Nothing about wiping files invalidates a handle. Forcing callers to rebuild after a sign-out
   * would be a trap: the natural call order is sign out, clear, carry on with public reads.
   */
  it('leaves existing handles usable', async () => {
    const instance = getSqlConnect(CONFIG)
    await clearCache()

    expect(getSqlConnect(CONFIG)).toBe(instance)
  })

  it('can run repeatedly - a cleared cache is not an error', async () => {
    await expect(clearCache()).resolves.toBe(0)
    await expect(clearCache()).resolves.toBe(0)
    expect(native.__calls.filter(call => call.method === 'clearCache')).toHaveLength(2)
  })
})
