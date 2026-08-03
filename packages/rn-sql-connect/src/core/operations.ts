import { errorFromPayload, errorFromRejection } from './errors'
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
  return { data: result.data as Data }
}
