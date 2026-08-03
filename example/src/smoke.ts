/**
 * Scripted smoke test against the Data Connect emulator.
 *
 * Runs on app start so the whole native path can be checked from a terminal:
 *
 *   npm run emulator          # terminal 1
 *   npm run smoke:android     # terminal 2
 *
 * Every line is printed with the [SMOKE] prefix so a script can grep the
 * device log instead of somebody tapping buttons and reading a screen.
 */
import {
  executeMutation,
  executeQuery,
  getDiagnostics,
  QueryFetchPolicy,
  SqlConnectError,
  subscribe,
  type SqlConnect,
} from 'rn-sql-connect'

export type SmokeStep = {
  name: string
  passed: boolean
  detail: string
}

const INT64 = '9007199254740993'

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const describeError = (error: unknown): string =>
  error instanceof SqlConnectError ? `${error.code}: ${error.message}` : String(error)

type MovieRow = {
  movie?: {
    id: string
    title: string
    rating?: number | null
    viewCount?: string | null
    metadata?: unknown
  }
}

export const runSmokeTest = async (
  dc: SqlConnect,
  onStep: (step: SmokeStep) => void,
): Promise<SmokeStep[]> => {
  const steps: SmokeStep[] = []
  const record = (name: string, passed: boolean, detail: string) => {
    const step = { name, passed, detail }
    steps.push(step)
    onStep(step)
    // eslint-disable-next-line no-console
    console.log(`[SMOKE] ${passed ? 'PASS' : 'FAIL'} ${name} :: ${detail}`)
  }

  let movieId = ''

  try {
    const created = await executeMutation<{ movie_insert: { id: string } }>(dc, 'CreateMovie', {
      title: 'Dune',
      genre: 'Sci-Fi',
      rating: 5,
      viewCount: INT64,
      metadata: { nested: { deep: [1, 2, null, 'x'] } },
    })
    movieId = created.data.movie_insert.id
    record('mutation', movieId.length > 0, `created ${movieId}`)
  } catch (error) {
    record('mutation', false, describeError(error))
    return steps
  }

  try {
    const result = await executeQuery<MovieRow>(
      dc,
      'GetMovieById',
      { id: movieId },
      { fetchPolicy: QueryFetchPolicy.SERVER_ONLY },
    )
    const movie = result.data.movie
    record(
      'query SERVER_ONLY',
      result.source === 'server' && movie?.title === 'Dune',
      `source=${result.source} title=${movie?.title}`,
    )
    // Int64 must survive as a string. A bridge that turns it into a double
    // would silently return 9007199254740992 here.
    record(
      'int64 fidelity',
      movie?.viewCount === INT64,
      `expected ${INT64}, got ${String(movie?.viewCount)}`,
    )
    record(
      'uuid fidelity',
      typeof movie?.id === 'string' && movie.id === movieId,
      `id=${String(movie?.id)}`,
    )
    const metadata = movie?.metadata as { nested?: { deep?: unknown[] } } | undefined
    record(
      'nested Any scalar',
      Array.isArray(metadata?.nested?.deep) && metadata?.nested?.deep?.length === 4,
      JSON.stringify(metadata),
    )
  } catch (error) {
    record('query SERVER_ONLY', false, describeError(error))
  }

  try {
    const cached = await executeQuery<MovieRow>(
      dc,
      'GetMovieById',
      { id: movieId },
      { fetchPolicy: QueryFetchPolicy.CACHE_ONLY },
    )
    record(
      'query CACHE_ONLY',
      cached.source === 'cache' && cached.data.movie?.title === 'Dune',
      `source=${cached.source}`,
    )
  } catch (error) {
    record('query CACHE_ONLY', false, describeError(error))
  }

  try {
    const updates: number[] = []
    const unsubscribe = subscribe<MovieRow>(
      dc,
      'GetMovieById',
      { id: movieId },
      {
        next: result => {
          const rating = result.data.movie?.rating
          if (typeof rating === 'number') {
            updates.push(rating)
          }
        },
        error: error => {
          // eslint-disable-next-line no-console
          console.log(`[SMOKE] subscription error :: ${describeError(error)}`)
        },
      },
    )

    await wait(1500)
    const before = updates.length
    await executeMutation(dc, 'UpdateMovie', { id: movieId, genre: 'Sci-Fi', rating: 3 })
    await wait(4000)
    unsubscribe()

    record(
      'realtime subscription',
      updates.length > before && updates[updates.length - 1] === 3,
      `updates=${JSON.stringify(updates)}`,
    )
  } catch (error) {
    record('realtime subscription', false, describeError(error))
  }

  try {
    const diagnostics = await getDiagnostics(dc)
    record(
      'diagnostics',
      diagnostics.configured && diagnostics.activeSubscriptions === 0,
      JSON.stringify(diagnostics),
    )
  } catch (error) {
    record('diagnostics', false, describeError(error))
  }

  try {
    await executeQuery(dc, 'NoSuchOperation')
    record('error mapping', false, 'expected a failure but the call succeeded')
  } catch (error) {
    const mapped = error instanceof SqlConnectError
    record('error mapping', mapped, describeError(error))
  }

  const passed = steps.filter(step => step.passed).length
  // eslint-disable-next-line no-console
  console.log(`[SMOKE] RESULT ${passed}/${steps.length} passed`)
  return steps
}
