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
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from '@react-native-firebase/auth';
import { Platform } from 'react-native';
import {
  clearCache,
  executeMutation,
  executeQuery,
  getDiagnostics,
  QueryFetchPolicy,
  SqlConnectError,
  subscribe,
  type SqlConnect,
} from 'rn-sql-connect';

export type SmokeStep = {
  name: string;
  passed: boolean;
  detail: string;
};

const INT64 = '9007199254740993';
const RELEASED_AT = '2026-08-04T09:30:00Z';
const RELEASED_ON = '2026-08-04';
const SCORE = 8.5;
const TAGS = ['sci-fi', 'desert'];
const SCORES = [3, 5, 8];

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/** Variables for the cache-wipe probe. Shared so populate and read-back hit the same cache entry. */
const CACHE_PROBE_VARS = { genre: 'sci-fi', limit: 5 };

const describeError = (error: unknown): string =>
  error instanceof SqlConnectError
    ? `${error.code}: ${error.message}`
    : String(error);

type MovieRow = {
  movie?: {
    id: string;
    title: string;
    rating?: number | null;
    viewCount?: string | null;
    releasedAt?: string | null;
    releasedOn?: string | null;
    score?: number | null;
    isFeatured?: boolean | null;
    tags?: string[] | null;
    scores?: number[] | null;
    metadata?: unknown;
  };
};

/**
 * Points Firebase Auth at the emulator. The host differs per runtime: the
 * Android emulator reaches the machine through 10.0.2.2, everything else
 * through localhost.
 */
export const connectAuthToEmulator = (): void => {
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  connectAuthEmulator(getAuth(), `http://${host}:9099`);
};

export const runSmokeTest = async (
  dc: SqlConnect,
  onStep: (step: SmokeStep) => void,
): Promise<SmokeStep[]> => {
  const steps: SmokeStep[] = [];
  const record = (name: string, passed: boolean, detail: string) => {
    const step = { name, passed, detail };
    steps.push(step);
    onStep(step);
    // eslint-disable-next-line no-console
    console.log(`[SMOKE] ${passed ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
  };

  let movieId: string;

  try {
    const created = await executeMutation<{ movie_insert: { id: string } }>(
      dc,
      'CreateMovie',
      {
        title: 'Dune',
        genre: 'Sci-Fi',
        rating: 5,
        viewCount: INT64,
        releasedAt: RELEASED_AT,
        releasedOn: RELEASED_ON,
        score: SCORE,
        isFeatured: true,
        tags: TAGS,
        scores: SCORES,
        metadata: { nested: { deep: [1, 2, null, 'x'] } },
      },
    );
    movieId = created.data.movie_insert.id;
    record('mutation', movieId.length > 0, `created ${movieId}`);
  } catch (error) {
    record('mutation', false, describeError(error));
    return steps;
  }

  try {
    const result = await executeQuery<MovieRow>(
      dc,
      'GetMovieById',
      { id: movieId },
      { fetchPolicy: QueryFetchPolicy.SERVER_ONLY },
    );
    const movie = result.data.movie;
    record(
      'query SERVER_ONLY',
      result.source === 'server' && movie?.title === 'Dune',
      `source=${result.source} title=${movie?.title}`,
    );
    // Int64 must survive as a string. A bridge that turns it into a double
    // would silently return 9007199254740992 here.
    record(
      'int64 fidelity',
      movie?.viewCount === INT64,
      `expected ${INT64}, got ${String(movie?.viewCount)}`,
    );
    record(
      'uuid fidelity',
      typeof movie?.id === 'string' && movie.id === movieId,
      `id=${String(movie?.id)}`,
    );
    // The server normalises the timestamp format, so compare the instant rather
    // than the text. A timezone bug still fails this.
    const sameInstant =
      typeof movie?.releasedAt === 'string' &&
      Date.parse(movie.releasedAt) === Date.parse(RELEASED_AT);
    record(
      'timestamp fidelity',
      sameInstant,
      `got ${String(movie?.releasedAt)}`,
    );
    record(
      'date fidelity',
      movie?.releasedOn === RELEASED_ON,
      `expected ${RELEASED_ON}, got ${String(movie?.releasedOn)}`,
    );
    record(
      'float and boolean fidelity',
      movie?.score === SCORE && movie?.isFeatured === true,
      `score=${String(movie?.score)} isFeatured=${String(movie?.isFeatured)}`,
    );
    record(
      'list fidelity',
      JSON.stringify(movie?.tags) === JSON.stringify(TAGS) &&
        JSON.stringify(movie?.scores) === JSON.stringify(SCORES),
      `tags=${JSON.stringify(movie?.tags)} scores=${JSON.stringify(movie?.scores)}`,
    );
    const metadata = movie?.metadata as
      { nested?: { deep?: unknown[] } } | undefined;
    record(
      'nested Any scalar',
      Array.isArray(metadata?.nested?.deep) &&
        metadata?.nested?.deep?.length === 4,
      JSON.stringify(metadata),
    );
  } catch (error) {
    record('query SERVER_ONLY', false, describeError(error));
  }

  try {
    const cached = await executeQuery<MovieRow>(
      dc,
      'GetMovieById',
      { id: movieId },
      { fetchPolicy: QueryFetchPolicy.CACHE_ONLY },
    );
    record(
      'query CACHE_ONLY',
      cached.source === 'cache' && cached.data.movie?.title === 'Dune',
      `source=${cached.source}`,
    );
  } catch (error) {
    record('query CACHE_ONLY', false, describeError(error));
  }

  try {
    const updates: number[] = [];
    const unsubscribe = subscribe<MovieRow>(
      dc,
      'GetMovieById',
      { id: movieId },
      {
        next: result => {
          const rating = result.data.movie?.rating;
          if (typeof rating === 'number') {
            updates.push(rating);
          }
        },
        error: error => {
          // eslint-disable-next-line no-console
          console.log(`[SMOKE] subscription error :: ${describeError(error)}`);
        },
      },
    );

    await wait(1500);
    const before = updates.length;
    await executeMutation(dc, 'UpdateMovie', {
      id: movieId,
      genre: 'Sci-Fi',
      rating: 3,
    });
    await wait(4000);
    unsubscribe();
    // Unsubscribe crosses the bridge asynchronously, so give it a moment before
    // asking native how many subscriptions are left.
    await wait(500);

    record(
      'realtime subscription',
      updates.length > before && updates[updates.length - 1] === 3,
      `updates=${JSON.stringify(updates)}`,
    );
  } catch (error) {
    record('realtime subscription', false, describeError(error));
  }

  // Auth. This is the reason the package exists: Data Connect has to read the
  // identity from the same FirebaseApp that react-native-firebase configured,
  // with no token plumbing in between.
  const auth = getAuth();

  try {
    await executeQuery(dc, 'GetMyReviews', undefined, {
      fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
    });
    record(
      'auth gate blocks a signed-out caller',
      false,
      'the query succeeded while signed out',
    );
  } catch (error) {
    const code = error instanceof SqlConnectError ? error.code : 'unknown';
    record(
      'auth gate blocks a signed-out caller',
      code === 'unauthenticated' || code === 'unauthorized',
      describeError(error),
    );
  }

  try {
    // Email sign-in rather than anonymous on purpose: Data Connect's
    // `@auth(level: USER)` rejects anonymous users, which need `USER_ANON`.
    // A fresh address per run keeps repeated runs independent.
    const email = `smoke-${Date.now()}@example.com`;
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      'smoke-password',
    );
    const uid = credential.user.uid;

    await executeMutation(dc, 'CreateMyReview', {
      movieId,
      body: 'Watched it twice.',
    });
    const reviews = await executeQuery<{
      reviews: { id: string; body: string }[];
    }>(dc, 'GetMyReviews', undefined, {
      fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
    });
    record(
      'auth USER operation with a signed-in user',
      reviews.data.reviews.some(review => review.body === 'Watched it twice.'),
      `uid=${uid} reviews=${reviews.data.reviews.length}`,
    );

    const diagnostics = await getDiagnostics(dc);
    record(
      'native sees the signed-in user',
      diagnostics.hasCurrentUser === true && diagnostics.uid === uid,
      JSON.stringify({
        hasCurrentUser: diagnostics.hasCurrentUser,
        uid: diagnostics.uid,
      }),
    );

    await signOut(auth);
  } catch (error) {
    record(
      'auth USER operation with a signed-in user',
      false,
      describeError(error),
    );
  }

  try {
    const diagnostics = await getDiagnostics(dc);
    record(
      'diagnostics',
      diagnostics.configured && diagnostics.activeSubscriptions === 0,
      JSON.stringify(diagnostics),
    );
  } catch (error) {
    record('diagnostics', false, describeError(error));
  }

  try {
    await executeQuery(dc, 'NoSuchOperation');
    record('error mapping', false, 'expected a failure but the call succeeded');
  } catch (error) {
    const mapped =
      error instanceof SqlConnectError && error.code === 'not-found';
    record('error mapping', mapped, describeError(error));
  }

  // Cache wipe last: it deletes files the steps above populated, so running it earlier would
  // change what they measure.
  try {
    // Populate first - a wipe that reports 0 because nothing was ever cached proves nothing.
    // PUBLIC operation, and the smoke run has signed out by now - a USER one would fail here for
    // a reason that has nothing to do with the cache.
    await executeQuery(dc, 'ListMoviesByGenre', CACHE_PROBE_VARS, {
      fetchPolicy: QueryFetchPolicy.SERVER_ONLY,
    });

    const firstPass = await clearCache();
    const secondPass = await clearCache();

    // Idempotence is the assertion that actually proves erasure at the file level: had the first
    // pass silently failed to delete anything, the second would report the same non-zero count.
    // Asserting on a CACHE_ONLY miss instead would be testing something else - see below.
    record(
      'clearCache removes the cache files and is idempotent',
      firstPass > 0 && secondPass === 0,
      `first=${firstPass} second=${secondPass}`,
    );

    // Recorded, deliberately NOT asserted. Whether a CACHE_ONLY read still hits right after the
    // wipe depends on whether the SDK is holding the deleted file open: on POSIX the handle keeps
    // working against the unlinked file until the process exits. The files are gone from disk
    // either way, which is what the wipe promises. This line reports which way the platform went,
    // so that the answer comes from a device rather than from reasoning about it.
    let afterWipe: string;
    try {
      // Same variables as the populating call: different variables are a different cache entry,
      // so a miss would prove nothing about the wipe.
      const cached = await executeQuery(
        dc,
        'ListMoviesByGenre',
        CACHE_PROBE_VARS,
        {
          fetchPolicy: QueryFetchPolicy.CACHE_ONLY,
        },
      );
      afterWipe = `still served from an open handle (source=${cached.source})`;
    } catch (error) {
      const code = error instanceof SqlConnectError ? error.code : 'unknown';
      afterWipe = `CACHE_ONLY now misses (code=${code})`;
    }
    record(
      'clearCache: what a CACHE_ONLY read does afterwards',
      true,
      afterWipe,
    );
  } catch (error) {
    record(
      'clearCache removes the cache files and is idempotent',
      false,
      describeError(error),
    );
  }

  const passed = steps.filter(step => step.passed).length;
  // eslint-disable-next-line no-console
  console.log(`[SMOKE] RESULT ${passed}/${steps.length} passed`);
  return steps;
};
