import { errorFromRejection } from './errors'
import { getNativeModule } from './native'

/**
 * Deletes every Data Connect cache file this app has on disk.
 *
 * ## Why this exists
 *
 * Both native SDKs cache query results on disk by default, and neither exposes any way to erase
 * them. `terminate()` does not: on Android it closes the client, on Apple platforms it does not
 * even do that, and on neither platform does it touch the files. So an app that signs a user out,
 * or deletes their account, leaves that user's rows sitting in an app-private SQLite database
 * until the OS reclaims the app's storage. This is the missing half of sign-out.
 *
 * ## What it removes
 *
 * Everything, for every connector and every user of this app - not one instance's slice:
 *
 *   - Apple: everything inside `<Documents>/com.google.firebase.dataconnect` (the directory itself
 *     stays; the SDK recreates its contents on demand). The SDK names each
 *     file after a hash of `(storage, projectId, appName, serviceId, connector, location, host)`
 *     plus a hash of the signed-in uid, which means one file per user per connector. Reproducing
 *     that recipe here to delete a single slice would be betting on an internal detail that has no
 *     stability promise; when it changes, the bet fails silently and nothing is erased.
 *   - Android: every `dataconnect_*` file in the app's `databases` directory, via
 *     `SQLiteDatabase.deleteDatabase` so journal/WAL/shm siblings go too. Android keeps ONE
 *     database and scopes rows by uid inside it, so there is no per-user file to single out.
 *
 * The SDK recreates what it needs on the next query. Calling this on a fresh install, or twice in
 * a row, is not an error - it just reports 0.
 *
 * ## The files go immediately; the current process may not notice until it restarts
 *
 * Measured on a device (both platforms, 05/08/2026), populating a cache then clearing it:
 *
 *   | | files removed | a `CACHE_ONLY` read straight afterwards |
 *   |---|---|---|
 *   | iOS | 3, second call 0 | misses, code `cache-miss` |
 *   | Android | 3, second call 0 | **still served**, `source: 'cache'` |
 *
 * They differ because Android's open SQLite handle keeps reading the now-unlinked file until the
 * process exits. On disk the result is identical and that is what this function promises: the
 * databases directory is empty on both. What Android keeps alive is one handle inside the running
 * process, and it dies with the process.
 *
 * If a read must miss *now* rather than after the next launch, do not rely on this - route the
 * read with `SERVER_ONLY`. Signing out first is still the right order: it is when the Apple SDK
 * closes the file it holds.
 *
 * There is no need to `terminate()` first, and no need to recreate handles afterwards.
 *
 * @returns how many files were removed. Useful in tests; safe to ignore.
 * @throws {SqlConnectError} with code `internal` if the platform refuses the deletion (a file
 *   locked by another process, for instance). A cache that could not be cleared must not look
 *   like a cache that was empty.
 */
export const clearCache = async (): Promise<number> => {
  try {
    return await getNativeModule().clearCache()
  } catch (error) {
    throw errorFromRejection(error)
  }
}
