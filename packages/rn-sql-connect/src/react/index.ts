import { useCallback, useEffect, useRef, useState } from 'react'

import { executeQuery } from '../core/operations'
import { stableKey } from '../core/serialize'
import { subscribe } from '../core/subscriptions'
import type {
  DataSource,
  ExecuteQueryOptions,
  SqlConnect,
  Variables,
} from '../core/types'

export type UseSqlConnectQueryOptions = ExecuteQueryOptions & {
  /** Keeps the result live by subscribing instead of fetching once. */
  subscribe?: boolean
  /** Skips the query entirely, for screens that need to wait on something else. */
  skip?: boolean
}

export type UseSqlConnectQueryResult<Data> = {
  data?: Data
  error?: Error
  loading: boolean
  source?: DataSource
  refetch: () => Promise<void>
}

/**
 * Runs a query and keeps its result in component state.
 *
 * This is deliberately small: no global cache, no request dedupe beyond what
 * the native SDK already does. Apps that want a query cache should keep using
 * their own data layer and call `executeQuery` from it.
 */
export const useSqlConnectQuery = <Data = unknown, Vars extends Variables = Variables>(
  instance: SqlConnect,
  operationName: string,
  variables?: Vars,
  options: UseSqlConnectQueryOptions = {},
): UseSqlConnectQueryResult<Data> => {
  const { subscribe: live = false, skip = false, fetchPolicy } = options
  const [state, setState] = useState<{
    data?: Data
    error?: Error
    loading: boolean
    source?: DataSource
  }>({ loading: !skip })

  // Variables are compared by value. Callers should not have to memoise the
  // object literal they pass in, that is a classic source of render loops.
  //
  // `variables` is read directly in the callbacks below and the effects key on
  // `variablesKey` instead. An earlier version mirrored it into a ref and wrote
  // that ref during render, which is not safe under concurrent rendering.
  const variablesKey = stableKey(variables ?? {})

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const runQuery = useCallback(async () => {
    setState(previous => ({ ...previous, loading: true }))
    try {
      const result = await executeQuery<Data, Vars>(
        instance,
        operationName,
        variables,
        { fetchPolicy },
      )
      if (mountedRef.current) {
        setState({ data: result.data, source: result.source, loading: false, error: undefined })
      }
    } catch (error) {
      if (mountedRef.current) {
        setState(previous => ({ ...previous, error: error as Error, loading: false }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, operationName, fetchPolicy, variablesKey])

  // Two effects rather than one branching effect. Sharing it meant the
  // subscription depended on `runQuery`, whose identity changes with
  // `fetchPolicy`, so changing the fetch policy tore down a live subscription
  // and built a new one for nothing.
  useEffect(() => {
    if (skip || live) {
      if (skip) {
        setState(previous => ({ ...previous, loading: false }))
      }
      return
    }
    void runQuery()
  }, [skip, live, runQuery])

  useEffect(() => {
    if (skip || !live) {
      return
    }
    setState(previous => ({ ...previous, loading: true }))
    const unsubscribe = subscribe<Data, Vars>(instance, operationName, variables, {
      next: result => {
        if (mountedRef.current) {
          setState({ data: result.data, source: result.source, loading: false, error: undefined })
        }
      },
      error: error => {
        if (mountedRef.current) {
          setState(previous => ({ ...previous, error, loading: false }))
        }
      },
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, operationName, variablesKey, live, skip])

  return { ...state, refetch: runQuery }
}
