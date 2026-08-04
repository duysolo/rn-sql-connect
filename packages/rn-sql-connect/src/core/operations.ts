import { SqlConnectError, errorFromPayload, errorFromRejection } from './errors'
import { ensureConfigured } from './instance'
import { getNativeModule } from './native'
import { serializeVariables } from './serialize'
import {
  QueryFetchPolicy,
  type ExecuteQueryOptions,
  type MutationResult,
  type QueryResult,
  type SqlConnect,
  type Variables,
} from './types'

type NativeResult = {
  data?: unknown
  source?: string
  error?: unknown
}

const parseResult = (raw: string, operationName: string): NativeResult => {
  try {
    return JSON.parse(raw) as NativeResult
  } catch (error) {
    throw errorFromRejection(error, operationName)
  }
}

/**
 * Runs a query.
 *
 * The default fetch policy is PREFER_CACHE, matching the native SDKs. Note that
 * with the default `maxAge` of 0 that still hits the server every time. If a
 * stale read would be a bug, pass SERVER_ONLY explicitly rather than relying on
 * cache configuration staying the way it is today.
 */
export const executeQuery = async <Data = unknown, Vars extends Variables = Variables>(
  instance: SqlConnect,
  operationName: string,
  variables?: Vars,
  options: ExecuteQueryOptions = {},
): Promise<QueryResult<Data>> => {
  const fetchPolicy = options.fetchPolicy ?? QueryFetchPolicy.PREFER_CACHE

  let raw: string
  try {
    // Configuration is inside the try so that a failure to reach Firebase still
    // reports which operation triggered it.
    await ensureConfigured(instance)
    raw = await getNativeModule().executeQuery(
      instance.key,
      operationName,
      serializeVariables(variables),
      fetchPolicy,
    )
  } catch (error) {
    throw errorFromRejection(error, operationName)
  }

  const result = parseResult(raw, operationName)
  if (result.error) {
    throw errorFromPayload(result.error, operationName)
  }
  // Native reports a cache miss as an error, so reaching here with nothing would
  // mean the native contract changed. Checked anyway: the alternative is handing
  // back `data: null` under a type that promises otherwise, which surfaces as a
  // TypeError inside the caller's own code with nothing pointing back here.
  if (result.data === null || result.data === undefined) {
    throw new SqlConnectError({
      code: fetchPolicy === QueryFetchPolicy.CACHE_ONLY ? 'cache-miss' : 'internal',
      operationName,
      message:
        fetchPolicy === QueryFetchPolicy.CACHE_ONLY
          ? `CACHE_ONLY found nothing cached for "${operationName}". Note that maxAge defaults ` +
            'to 0, which caches responses but never serves them; raise it to read from the cache.'
          : `"${operationName}" returned no data.`,
    })
  }
  return {
    data: result.data as Data,
    source: result.source === 'cache' ? 'cache' : 'server',
  }
}

/** Runs a mutation. Mutations always go to the server. */
export const executeMutation = async <Data = unknown, Vars extends Variables = Variables>(
  instance: SqlConnect,
  operationName: string,
  variables?: Vars,
): Promise<MutationResult<Data>> => {
  let raw: string
  try {
    await ensureConfigured(instance)
    raw = await getNativeModule().executeMutation(
      instance.key,
      operationName,
      serializeVariables(variables),
    )
  } catch (error) {
    throw errorFromRejection(error, operationName)
  }

  const result = parseResult(raw, operationName)
  if (result.error) {
    throw errorFromPayload(result.error, operationName)
  }
  if (result.data === null || result.data === undefined) {
    throw new SqlConnectError({
      code: 'internal',
      operationName,
      message: `"${operationName}" returned no data.`,
    })
  }
  return { data: result.data as Data }
}
