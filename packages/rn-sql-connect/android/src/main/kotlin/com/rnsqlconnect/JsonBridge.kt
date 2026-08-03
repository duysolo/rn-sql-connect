package com.rnsqlconnect

import com.google.firebase.dataconnect.AnyValue
import org.json.JSONArray
import org.json.JSONObject

/**
 * Converts between JSON text and the value shapes the Data Connect SDK works
 * with.
 *
 * JSON text is used as the bridge format on purpose. Data Connect encodes
 * Int64, UUID, Date and Timestamp as strings, and a ReadableMap round trip
 * risks turning those into doubles.
 */
internal object JsonBridge {

  /**
   * Parses operation variables.
   *
   * Returns the key order as well, because the variables serializer has to
   * build a serial descriptor whose element indices line up with the values it
   * later encodes.
   */
  fun parseVariables(json: String): VariablesPayload {
    val trimmed = json.trim()
    if (trimmed.isEmpty() || trimmed == "{}") {
      return VariablesPayload(emptyList(), emptyMap())
    }
    val obj = JSONObject(trimmed)
    val keys = mutableListOf<String>()
    val values = mutableMapOf<String, AnyValue?>()
    val iterator = obj.keys()
    while (iterator.hasNext()) {
      val key = iterator.next()
      keys.add(key)
      values[key] = toAnyValue(obj.get(key))
    }
    return VariablesPayload(keys, values)
  }

  /** Wraps a decoded JSON node into [AnyValue], returning null for JSON null. */
  private fun toAnyValue(node: Any?): AnyValue? =
    when (node) {
      null, JSONObject.NULL -> null
      is JSONObject -> AnyValue(toMap(node))
      is JSONArray -> AnyValue(toList(node))
      is Boolean -> AnyValue(node)
      is String -> AnyValue(node)
      is Int -> AnyValue(node.toDouble())
      is Long -> AnyValue(node.toDouble())
      is Double -> AnyValue(node)
      is Float -> AnyValue(node.toDouble())
      else -> AnyValue(node.toString())
    }

  private fun toMap(obj: JSONObject): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>()
    val iterator = obj.keys()
    while (iterator.hasNext()) {
      val key = iterator.next()
      result[key] = toPlain(obj.get(key))
    }
    return result
  }

  private fun toList(array: JSONArray): List<Any?> {
    val result = mutableListOf<Any?>()
    for (index in 0 until array.length()) {
      result.add(toPlain(array.get(index)))
    }
    return result
  }

  /**
   * Nested values inside [AnyValue] are plain Kotlin types, not nested
   * AnyValue instances, and numbers must be doubles because the wire format is
   * a protobuf Value.
   */
  private fun toPlain(node: Any?): Any? =
    when (node) {
      null, JSONObject.NULL -> null
      is JSONObject -> toMap(node)
      is JSONArray -> toList(node)
      is Int -> node.toDouble()
      is Long -> node.toDouble()
      is Float -> node.toDouble()
      else -> node
    }

  /** Serialises a decoded operation result back to JSON text. */
  fun stringifyResult(data: AnyValue?, source: String): String {
    val payload = JSONObject()
    payload.put("data", toJsonNode(data?.value))
    payload.put("source", source)
    return payload.toString()
  }

  fun stringifyError(error: NormalizedError): String {
    val payload = JSONObject()
    payload.put("error", error.toJson())
    return payload.toString()
  }

  fun toJsonNode(value: Any?): Any =
    when (value) {
      null -> JSONObject.NULL
      is Map<*, *> -> {
        val obj = JSONObject()
        value.forEach { (key, item) -> obj.put(key.toString(), toJsonNode(item)) }
        obj
      }
      is List<*> -> {
        val array = JSONArray()
        value.forEach { item -> array.put(toJsonNode(item)) }
        array
      }
      is AnyValue -> toJsonNode(value.value)
      is Double -> if (value == Math.floor(value) && !value.isInfinite() && Math.abs(value) < 1e15) {
        // Whole doubles are emitted without a trailing ".0" so that a count of
        // 3 does not arrive in JavaScript looking different from the web SDK.
        value.toLong()
      } else {
        value
      }
      else -> value
    }
}

internal data class VariablesPayload(
  val keys: List<String>,
  val values: Map<String, AnyValue?>,
)
