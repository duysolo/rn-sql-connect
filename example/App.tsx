/**
 * Manual test harness for rn-sql-connect.
 *
 * Runs against the local Data Connect emulator, so no real Firebase project is
 * involved. Start it first:
 *
 *   npm run emulator
 *
 * Each button covers something the unit tests cannot: that the native layer
 * actually talks to Data Connect.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { runSmokeTest, connectAuthToEmulator, type SmokeStep } from './src/smoke'
import {
  connectSqlConnectEmulator,
  executeMutation,
  executeQuery,
  getDiagnostics,
  getSqlConnect,
  QueryFetchPolicy,
  SqlConnectError,
  subscribe,
  type Unsubscribe,
} from 'rn-sql-connect'

const dc = getSqlConnect(
  { connector: 'example', location: 'asia-southeast1', serviceId: 'example' },
  { cacheSettings: { storage: 'persistent', maxAge: '30s' } },
)

// The Android emulator reaches the host through 10.0.2.2 and the iOS simulator
// through 127.0.0.1. Leaving the host empty lets each native SDK apply its own
// default, which is exactly that mapping.
connectSqlConnectEmulator(dc, { port: 9399 })
// Auth runs against the emulator too, so the auth-gated steps need no real
// project and no real credentials.
connectAuthToEmulator()

type LogEntry = { id: number; text: string; failed: boolean }

const Button = ({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}): React.JSX.Element => (
  <Pressable style={styles.button} onPress={onPress}>
    <Text style={styles.buttonLabel}>{label}</Text>
  </Pressable>
)

const App = (): React.JSX.Element => {
  const [log, setLog] = useState<LogEntry[]>([])
  const [movieId, setMovieId] = useState<string | undefined>()
  const counter = useRef(0)
  const unsubscribeRef = useRef<Unsubscribe | undefined>(undefined)

  const append = useCallback((text: string, failed = false) => {
    // The id is computed here rather than inside the updater. React can invoke
    // an updater twice, which would hand two entries the same key.
    counter.current += 1
    const id = counter.current
    setLog(previous => [{ id, text, failed }, ...previous].slice(0, 40))
  }, [])

  const run = useCallback(
    async (label: string, action: () => Promise<string>) => {
      try {
        append(`${label}: ${await action()}`)
      } catch (error) {
        const detail =
          error instanceof SqlConnectError ? `${error.code} - ${error.message}` : String(error)
        append(`${label} FAILED: ${detail}`, true)
      }
    },
    [append],
  )

  const createMovie = useCallback(
    () =>
      run('createMovie', async () => {
        const result = await executeMutation<{ movie_insert: { id: string } }>(dc, 'CreateMovie', {
          title: `Dune ${new Date().toISOString().slice(11, 19)}`,
          genre: 'Sci-Fi',
          rating: 5,
          // Int64 travels as a string. Getting this back intact proves the JSON
          // bridge is doing its job.
          viewCount: '9007199254740993',
          metadata: { nested: { deep: [1, 2, null, 'x'] } },
        })
        setMovieId(result.data.movie_insert.id)
        return result.data.movie_insert.id
      }),
    [run],
  )

  const readMovie = useCallback(
    (fetchPolicy: (typeof QueryFetchPolicy)[keyof typeof QueryFetchPolicy]) =>
      run(`getMovieById ${fetchPolicy}`, async () => {
        if (!movieId) {
          return 'create a movie first'
        }
        const result = await executeQuery<{
          movie?: { title: string; viewCount?: string; metadata?: unknown }
        }>(dc, 'GetMovieById', { id: movieId }, { fetchPolicy })
        return `${result.source} | ${result.data.movie?.title} | viewCount=${result.data.movie?.viewCount}`
      }),
    [movieId, run],
  )

  const toggleSubscription = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = undefined
      append('subscription stopped')
      return
    }
    if (!movieId) {
      append('create a movie first', true)
      return
    }
    unsubscribeRef.current = subscribe<{ movie?: { title: string; rating?: number } }>(
      dc,
      'GetMovieById',
      { id: movieId },
      {
        next: result =>
          append(
            `update (${result.source}): ${result.data.movie?.title} rating=${result.data.movie?.rating}`,
          ),
        error: error => append(`subscription error: ${error.message}`, true),
      },
    )
    append('subscription started, now press "update rating"')
  }, [append, movieId])

  const updateRating = useCallback(
    () =>
      run('updateMovie', async () => {
        if (!movieId) {
          return 'create a movie first'
        }
        const rating = 1 + Math.floor(Math.random() * 5)
        await executeMutation(dc, 'UpdateMovie', { id: movieId, genre: 'Sci-Fi', rating })
        return `rating set to ${rating}`
      }),
    [movieId, run],
  )

  const showDiagnostics = useCallback(
    () => run('diagnostics', async () => JSON.stringify(await getDiagnostics(dc))),
    [run],
  )

  const smoke = useCallback(async () => {
    append('smoke test starting')
    const steps: SmokeStep[] = await runSmokeTest(dc, step =>
      append(`${step.passed ? 'PASS' : 'FAIL'} ${step.name}: ${step.detail}`, !step.passed),
    )
    const passed = steps.filter(step => step.passed).length
    append(`smoke result ${passed}/${steps.length}`, passed !== steps.length)
  }, [append])

  // Runs on start so the whole native path can be checked from a terminal
  // rather than by tapping through a screen.
  useEffect(() => {
    void smoke()
  }, [smoke])

  useEffect(() => () => unsubscribeRef.current?.(), [])

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>rn-sql-connect</Text>
      <Text style={styles.subtitle}>
        {Platform.OS} | emulator 9399 | movie {movieId ? movieId.slice(0, 8) : 'none'}
      </Text>
      <View style={styles.buttons}>
        <Button label="create movie" onPress={createMovie} />
        <Button label="read (server)" onPress={() => readMovie(QueryFetchPolicy.SERVER_ONLY)} />
        <Button label="read (cache)" onPress={() => readMovie(QueryFetchPolicy.CACHE_ONLY)} />
        <Button
          label="read (prefer cache)"
          onPress={() => readMovie(QueryFetchPolicy.PREFER_CACHE)}
        />
        <Button label="toggle subscription" onPress={toggleSubscription} />
        <Button label="update rating" onPress={updateRating} />
        <Button label="diagnostics" onPress={showDiagnostics} />
        <Button label="run smoke test" onPress={smoke} />
        <Button label="clear log" onPress={() => setLog([])} />
      </View>
      <ScrollView style={styles.log}>
        {log.map(entry => (
          <Text key={entry.id} style={[styles.line, entry.failed && styles.failed]}>
            {entry.text}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0b0c', padding: 12 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  subtitle: { color: '#8a8a8f', fontSize: 12, marginBottom: 12 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  button: {
    backgroundColor: '#1f6feb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonLabel: { color: '#ffffff', fontSize: 13 },
  log: { flex: 1, backgroundColor: '#141416', borderRadius: 6, padding: 8 },
  line: { color: '#d0d0d5', fontSize: 12, marginBottom: 6, fontFamily: 'Menlo' },
  failed: { color: '#ff6b6b' },
})

export default App
