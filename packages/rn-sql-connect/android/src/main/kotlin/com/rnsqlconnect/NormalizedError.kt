package com.rnsqlconnect

import com.google.firebase.dataconnect.DataConnectOperationException
import com.google.firebase.dataconnect.DataConnectPathSegment
import org.json.JSONArray
import org.json.JSONObject

/**
 * A platform-neutral error shape.
 *
 * Android throws a tree of exceptions while Apple platforms expose four
 * unrelated structs, so the two taxonomies do not line up. Both sides normalise
 * into this shape and keep the original code in `nativeCode` for debugging.
 */
internal data class NormalizedError(
  val code: String,
  val message: String,
  val operationName: String?,
  val graphQLErrors: List<GraphQLErrorInfo> = emptyList(),
  val partialData: Any? = null,
  val nativeCode: String? = null,
) {
  fun toJson(): JSONObject {
    val json = JSONObject()
    json.put("code", code)
    json.put("message", message)
    json.put("operationName", operationName ?: JSONObject.NULL)
    val errors = JSONArray()
    graphQLErrors.forEach { info ->
      val entry = JSONObject()
      entry.put("message", info.message)
      val path = JSONArray()
      info.path.forEach { segment -> path.put(segment) }
      entry.put("path", path)
      errors.put(entry)
    }
    json.put("graphQLErrors", errors)
    json.put("partialData", JsonBridge.toJsonNode(partialData))
    json.put("nativeCode", nativeCode ?: JSONObject.NULL)
    return json
  }

  companion object {
    /**
     * Maps a throwable coming out of the SDK.
     *
     * Exception types are checked before message text. Text matching is a last
     * resort here because the SDK does not expose the gRPC status: it breaks on
     * any wording change upstream, and it misfires on a message that happens to
     * contain a status name. An unrecognised error becomes `internal` with the
     * original text preserved, which is more useful than guessing.
     */
    fun from(throwable: Throwable, operationName: String?): NormalizedError {
      // A CACHE_ONLY miss arrives as CachedDataNotFoundException. Apple platforms
      // report that situation as `cache-miss`, so without this branch the two
      // platforms disagree about what a cold cache looks like: text matching
      // alone lands it in `internal`, because "cached data not found" does not
      // contain the literal "NOT_FOUND".
      //
      // Matched by class NAME rather than by type on purpose: the class is
      // `internal` in the Firebase SDK, so `is CachedDataNotFoundException` does
      // not compile outside that module. A name is still a far stabler signal
      // than a message, and being internal also means upstream may rename it
      // without calling that a breaking change - hence the fall-through below
      // rather than anything that depends on this matching.
      if (throwable::class.java.simpleName == "CachedDataNotFoundException") {
        return NormalizedError(
          code = "cache-miss",
          message = throwable.message
            ?: "CACHE_ONLY found nothing cached. Note that maxAge defaults to 0, which caches " +
            "responses but never serves them; raise it to read from the cache.",
          operationName = operationName,
          nativeCode = throwable::class.java.simpleName,
        )
      }

      if (throwable is DataConnectOperationException) {
        val response = throwable.response
        val infos = response.errors.map { error ->
          GraphQLErrorInfo(
            message = error.message,
            path = error.path.map { segment ->
              when (segment) {
                is DataConnectPathSegment.Field -> segment.field
                is DataConnectPathSegment.ListIndex -> segment.index
              }
            },
          )
        }
        val hasData = response.data != null || response.rawData != null
        return NormalizedError(
          code = if (hasData) "partial-error" else classify(throwable),
          message = throwable.message ?: "Data Connect operation failed",
          operationName = operationName,
          graphQLErrors = infos,
          partialData = response.data ?: response.rawData,
          nativeCode = throwable::class.java.simpleName,
        )
      }

      return NormalizedError(
        code = classify(throwable),
        message = throwable.message ?: throwable.toString(),
        operationName = operationName,
        nativeCode = throwable::class.java.simpleName,
      )
    }

    private fun classify(throwable: Throwable): String {
      val text = buildString {
        append(throwable.message ?: "")
        var cause = throwable.cause
        var depth = 0
        while (cause != null && depth < 5) {
          append(' ')
          append(cause.message ?: "")
          cause = cause.cause
          depth += 1
        }
      }.uppercase()

      return when {
        text.contains("UNAUTHENTICATED") -> "unauthenticated"
        text.contains("PERMISSION_DENIED") -> "unauthorized"
        text.contains("NOT_FOUND") -> "not-found"
        text.contains("INVALID_ARGUMENT") -> "invalid-argument"
        text.contains("UNAVAILABLE") || text.contains("DEADLINE_EXCEEDED") -> "unavailable"
        text.contains("CANCELLED") -> "cancelled"
        else -> "internal"
      }
    }
  }
}

internal data class GraphQLErrorInfo(
  val message: String,
  val path: List<Any>,
)
