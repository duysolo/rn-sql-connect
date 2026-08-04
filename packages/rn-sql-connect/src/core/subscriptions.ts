import { errorFromPayload, errorFromRejection } from './errors'
import { ensureConfigured } from './instance'
import { getNativeModule } from './native'
import { serializeVariables, stableKey } from './serialize'
import type {
  QueryResult,
  SqlConnect,
  SubscriptionObserver,
  Unsubscribe,
  Variables,
} from './types'

type Entry = {
  subId: string
  dedupeKey: string
  operationName: string
  observers: Set<SubscriptionObserver<unknown>>
  /** Last value seen, replayed to observers that join later. */
  last?: QueryResult<unknown>
  started: Promise<void>
  closed: boolean
}

const entriesBySubId = new Map<string, Entry>()
const entriesByDedupeKey = new Map<string, Entry>()

let counter = 0
let listener: { remove: () => void } | undefined

const nextSubId = (): string => {
  counter += 1
  return `rnsc-${counter}`
}

const dispatchNext = (entry: Entry, result: QueryResult<unknown>): void => {
  entry.last = result
  for (const observer of [...entry.observers]) {
    observer.next?.(result)
  }
}

const dispatchError = (entry: Entry, error: Error): void => {
  for (const observer of [...entry.observers]) {
    observer.error?.(error)
  }
}

const handleEvent = (event: { subId: string; payloadJson: string }): void => {
  const entry = entriesBySubId.get(event.subId)
  if (!entry) {
    // Event for a subscription we already dropped. Native cancellation is
    // asynchronous, so a straggler here is expected, not a bug.
    return
  }
  let payload: { data?: unknown; source?: string; error?: unknown }
  try {
    payload = JSON.parse(event.payloadJson) as typeof payload
  } catch (error) {
    dispatchError(entry, errorFromRejection(error, entry.operationName))
    return
  }
  if (payload.error) {
    dispatchError(entry, errorFromPayload(payload.error, entry.operationName))
    return
  }
  dispatchNext(entry, {
    data: payload.data,
    source: payload.source === 'cache' ? 'cache' : 'server',
  })
}

const ensureListener = (): void => {
  if (listener) {
    return
  }
  listener = getNativeModule().onQueryEvent(handleEvent)
}

const closeEntry = (entry: Entry): void => {
  if (entry.closed) {
    return
  }
  entry.closed = true
  entriesBySubId.delete(entry.subId)
  entriesByDedupeKey.delete(entry.dedupeKey)
  // Wait for the start call to settle first, otherwise native may receive the
  // cancel before it has registered the subscription.
  void entry.started
    .catch(() => undefined)
    .then(() => getNativeModule().unsubscribe(entry.subId))
    .catch(() => undefined)

  if (entriesBySubId.size === 0 && listener) {
    listener.remove()
    listener = undefined
  }
}

/**
 * Subscribes to a query and receives updates as the result changes.
 *
 * Callers that pass equal variables for the same operation share one native
 * subscription, so mounting the same screen twice does not double the server
 * side cost. Cancellation happens when the last observer detaches.
 *
 * Realtime requires the operation to declare `@refresh` on the server for
 * anything more complex than a primary-key lookup, and requires client caching
 * to be enabled. Without that the stream simply never pushes updates.
 */
export const subscribe = <Data = unknown, Vars extends Variables = Variables>(
  instance: SqlConnect,
  operationName: string,
  variables?: Vars,
  observer: SubscriptionObserver<Data> = {},
): Unsubscribe => {
  const variablesJson = serializeVariables(variables)
  const dedupeKey = `${instance.key}|${operationName}|${stableKey(variables ?? {})}`
  // Wrapped rather than stored directly. `observers` is a Set, so subscribing
  // twice with the SAME observer object would add one entry, and either
  // unsubscribe would then silence both callers.
  const typedObserver: SubscriptionObserver<unknown> = {
    next: result => observer.next?.(result as QueryResult<Data>),
    error: error => observer.error?.(error),
  }

  const existing = entriesByDedupeKey.get(dedupeKey)
  let entry: Entry
  if (existing) {
    entry = existing
    existing.observers.add(typedObserver)
    if (existing.last) {
      // Replay so a late joiner does not sit empty until the next push.
      const last = existing.last
      queueMicrotask(() => {
        if (existing.observers.has(typedObserver)) {
          typedObserver.next?.(last)
        }
      })
    }
  } else {
    ensureListener()
    const subId = nextSubId()
    const created: Entry = {
      subId,
      dedupeKey,
      operationName,
      observers: new Set([typedObserver]),
      closed: false,
      started: Promise.resolve(),
    }
    created.started = (async () => {
      await ensureConfigured(instance)
      await getNativeModule().subscribe(instance.key, subId, operationName, variablesJson)
    })().catch(error => {
      const mapped = errorFromRejection(error, operationName)
      dispatchError(created, mapped)
      closeEntry(created)
      throw mapped
    })
    // The rejection is already reported to observers above.
    void created.started.catch(() => undefined)

    entriesBySubId.set(subId, created)
    entriesByDedupeKey.set(dedupeKey, created)
    entry = created
  }

  // The entry is captured directly rather than looked up again on unsubscribe.
  // A lookup by key could land on a different entry that was created after this
  // one closed, and detaching from that one would cut short somebody else's
  // subscription.
  const target = entry
  let detached = false
  return () => {
    if (detached) {
      return
    }
    detached = true
    target.observers.delete(typedObserver)
    if (target.observers.size === 0) {
      closeEntry(target)
    }
  }
}

/** Number of live native subscriptions. Used by tests to prove there are no leaks. */
export const activeSubscriptionCount = (): number => entriesBySubId.size

/** Test seam. Drops JS bookkeeping without notifying native. */
export const resetSubscriptionsForTests = (): void => {
  entriesBySubId.clear()
  entriesByDedupeKey.clear()
  listener?.remove()
  listener = undefined
  counter = 0
}
