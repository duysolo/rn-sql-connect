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
 *   - Apple: the whole `<Documents>/com.google.firebase.dataconnect` directory. The SDK names each
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
 * ## Call it AFTER signing out
 *
 * Ordering matters, and only in one direction:
 *
 *   - Sign out first, then clear. On Apple platforms the SDK swaps cache files when the auth state
 *     changes and closes the one it was holding, so by then the signed-out user's file is closed
 *     and its deletion is complete.
 *   - Clearing while a database is still open deletes the files, but the SDK's open handle keeps
 *     reading and writing the now-unlinked file until the process exits. Nothing is left on disk
 *     either way; what lingers is one already-open handle inside the current process.
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
