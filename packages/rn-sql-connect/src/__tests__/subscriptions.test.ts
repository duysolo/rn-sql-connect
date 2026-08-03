import { createNativeMock, type NativeMock } from './nativeMock'

let native: NativeMock = createNativeMock()

jest.mock('../specs/NativeRnSqlConnect', () => ({
  __esModule: true,
  get default() {
    return native
  },
}))

import { getSqlConnect, resetInstancesForTests } from '../core/instance'
import { resetNativeModuleCache } from '../core/native'
import {
  activeSubscriptionCount,
  resetSubscriptionsForTests,
  subscribe,
} from '../core/subscriptions'

const CONFIG = { connector: 'tramev', location: 'asia-southeast1', serviceId: 'estations-io-service' }

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

beforeEach(() => {
  native = createNativeMock()
  resetNativeModuleCache()
  resetInstancesForTests()
  resetSubscriptionsForTests()
})

const subIdOf = (index = 0): string =>
  native.__calls.filter(call => call.method === 'subscribe')[index]?.args[1] as string

describe('subscribe', () => {
  it('starts one native subscription and delivers updates', async () => {
    const dc = getSqlConnect(CONFIG)
    const seen: unknown[] = []
    subscribe(dc, 'GetMovie', { id: '1' }, { next: result => seen.push(result) })
    await flush()

    native.__emit({
      subId: subIdOf(),
      payloadJson: JSON.stringify({ data: { title: 'Dune' }, source: 'server' }),
    })
    expect(seen).toEqual([{ data: { title: 'Dune' }, source: 'server' }])
  })

  it('shares one native subscription between observers with equal variables', async () => {
    const dc = getSqlConnect(CONFIG)
    const unsubA = subscribe(dc, 'GetMovie', { id: '1' }, { next: () => undefined })
    const unsubB = subscribe(dc, 'GetMovie', { id: '1' }, { next: () => undefined })
    await flush()

    expect(native.__calls.filter(call => call.method === 'subscribe')).toHaveLength(1)

    // Native is only told to stop once the last observer detaches.
    unsubA()
    await flush()
    expect(native.__calls.some(call => call.method === 'unsubscribe')).toBe(false)

    unsubB()
    await flush()
    expect(native.__calls.some(call => call.method === 'unsubscribe')).toBe(true)
  })

  it('treats key order in variables as the same subscription', async () => {
    const dc = getSqlConnect(CONFIG)
    subscribe(dc, 'ListMovies', { genre: 'Sci-Fi', limit: 10 }, { next: () => undefined })
    subscribe(dc, 'ListMovies', { limit: 10, genre: 'Sci-Fi' }, { next: () => undefined })
    await flush()
    expect(native.__calls.filter(call => call.method === 'subscribe')).toHaveLength(1)
  })

  it('replays the latest value to an observer that joins late', async () => {
    const dc = getSqlConnect(CONFIG)
    subscribe(dc, 'GetMovie', { id: '1' }, { next: () => undefined })
    await flush()
    native.__emit({
      subId: subIdOf(),
      payloadJson: JSON.stringify({ data: { title: 'Dune' }, source: 'cache' }),
    })

    const late: unknown[] = []
    subscribe(dc, 'GetMovie', { id: '1' }, { next: result => late.push(result) })
    await flush()
    expect(late).toEqual([{ data: { title: 'Dune' }, source: 'cache' }])
  })

  it('reports subscription errors to observers', async () => {
    const dc = getSqlConnect(CONFIG)
    const errors: Error[] = []
    subscribe(dc, 'GetMovie', { id: '1' }, { error: error => errors.push(error) })
    await flush()

    native.__emit({
      subId: subIdOf(),
      payloadJson: JSON.stringify({
        error: { code: 'unavailable', message: 'network down', graphQLErrors: [] },
      }),
    })
    expect(errors[0]).toMatchObject({ code: 'unavailable', message: 'network down' })
  })

  it('reports a failed start and cleans up', async () => {
    const dc = getSqlConnect(CONFIG)
    native.__failNext = { code: 'internal', message: 'no firebase app' }
    const errors: Error[] = []
    subscribe(dc, 'GetMovie', { id: '1' }, { error: error => errors.push(error) })
    await flush()

    expect(errors).toHaveLength(1)
    expect(activeSubscriptionCount()).toBe(0)
  })

  it('leaves no listener behind once every subscription is gone', async () => {
    const dc = getSqlConnect(CONFIG)
    const unsubscribes = Array.from({ length: 50 }, (_, index) =>
      subscribe(dc, 'GetMovie', { id: String(index) }, { next: () => undefined }),
    )
    await flush()
    expect(activeSubscriptionCount()).toBe(50)

    unsubscribes.forEach(unsubscribe => unsubscribe())
    await flush()
    expect(activeSubscriptionCount()).toBe(0)
    expect(native.__listenerCount()).toBe(0)
  })

  it('ignores events for subscriptions that were already dropped', async () => {
    const dc = getSqlConnect(CONFIG)
    const seen: unknown[] = []
    const unsubscribe = subscribe(dc, 'GetMovie', { id: '1' }, { next: value => seen.push(value) })
    await flush()
    const id = subIdOf()
    unsubscribe()
    await flush()

    expect(() =>
      native.__emit({
        subId: id,
        payloadJson: JSON.stringify({ data: {}, source: 'server' }),
      }),
    ).not.toThrow()
    expect(seen).toHaveLength(0)
  })

  it('keeps a resubscription alive when the previous one was closed', async () => {
    const dc = getSqlConnect(CONFIG)
    const first = subscribe(dc, 'GetMovie', { id: '1' }, { next: () => undefined })
    await flush()
    first()
    await flush()

    const seen: unknown[] = []
    subscribe(dc, 'GetMovie', { id: '1' }, { next: value => seen.push(value) })
    await flush()

    expect(native.__calls.filter(call => call.method === 'subscribe')).toHaveLength(2)
    expect(activeSubscriptionCount()).toBe(1)

    // Detaching the first observer again must not touch the new subscription.
    first()
    await flush()
    expect(activeSubscriptionCount()).toBe(1)

    native.__emit({
      subId: subIdOf(1),
      payloadJson: JSON.stringify({ data: { title: 'Dune' }, source: 'server' }),
    })
    expect(seen).toHaveLength(1)
  })

  it('is safe to unsubscribe twice', async () => {
    const dc = getSqlConnect(CONFIG)
    const unsubscribe = subscribe(dc, 'GetMovie', { id: '1' }, { next: () => undefined })
    await flush()
    unsubscribe()
    unsubscribe()
    await flush()
    expect(native.__calls.filter(call => call.method === 'unsubscribe')).toHaveLength(1)
  })
})
