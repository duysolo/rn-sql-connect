package com.rnsqlconnect

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.google.firebase.FirebaseApp
import com.google.firebase.dataconnect.AnyValue
import com.google.firebase.dataconnect.CacheSettings
import com.google.firebase.dataconnect.ConnectorConfig
import com.google.firebase.dataconnect.DataConnectSettings
import com.google.firebase.dataconnect.DataSource
import com.google.firebase.dataconnect.FirebaseDataConnect
import com.google.firebase.dataconnect.QueryRef
import com.google.firebase.dataconnect.getInstance
import com.google.firebase.dataconnect.serializers.AnyValueSerializer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CancellationException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

@ReactModule(name = RnSqlConnectModule.NAME)
class RnSqlConnectModule(reactContext: ReactApplicationContext) :
  NativeRnSqlConnectSpec(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val instances = ConcurrentHashMap<String, FirebaseDataConnect>()
  private val instanceApps = ConcurrentHashMap<String, FirebaseApp>()
  private val subscriptions = ConcurrentHashMap<String, Job>()

  override fun getName(): String = NAME

  // MARK: lifecycle

  override fun configure(
    instanceKey: String,
    appName: String,
    connector: String,
    location: String,
    serviceId: String,
    settingsJson: String?,
    promise: Promise,
  ) {
    scope.launch {
      runCatching {
        if (instances.containsKey(instanceKey)) {
          return@runCatching
        }
        val app = FirebaseApp.getInstance(appName)
        val config = ConnectorConfig(connector = connector, location = location, serviceId = serviceId)
        val instance = FirebaseDataConnect.getInstance(app, config, parseSettings(settingsJson))
        // putIfAbsent keeps a concurrent first call from creating two clients.
        val existing = instances.putIfAbsent(instanceKey, instance)
        if (existing != null) {
          instance.close()
        } else {
          instanceApps[instanceKey] = app
        }
      }.fold(
        onSuccess = { promise.resolve(null) },
        onFailure = { rejectWith(promise, it, null) },
      )
    }
  }

  override fun useEmulator(instanceKey: String, host: String, port: Double, promise: Promise) {
    scope.launch {
      runCatching {
        val instance = requireInstance(instanceKey)
        if (host.isEmpty()) {
          instance.useEmulator(port = port.toInt())
        } else {
          instance.useEmulator(host = host, port = port.toInt())
        }
      }.fold(
        onSuccess = { promise.resolve(null) },
        onFailure = { rejectWith(promise, it, null) },
      )
    }
  }

  override fun terminate(instanceKey: String, promise: Promise) {
    scope.launch {
      runCatching {
        subscriptions.keys.filter { it.startsWith("$instanceKey::") }.forEach { subId ->
          subscriptions.remove(subId)?.cancel()
        }
        instances.remove(instanceKey)?.close()
        instanceApps.remove(instanceKey)
      }.fold(
        onSuccess = { promise.resolve(null) },
        onFailure = { rejectWith(promise, it, null) },
      )
    }
  }

  // MARK: operations

  override fun executeQuery(
    instanceKey: String,
    operationName: String,
    variablesJson: String,
    fetchPolicy: String,
    promise: Promise,
  ) {
    scope.launch {
      runCatching {
        val ref = queryRef(instanceKey, operationName, variablesJson)
        val result = ref.execute(parseFetchPolicy(fetchPolicy))
        JsonBridge.stringifyResult(result.data, sourceName(result.dataSource))
      }.fold(
        onSuccess = { promise.resolve(it) },
        onFailure = { rejectWith(promise, it, operationName) },
      )
    }
  }

  override fun executeMutation(
    instanceKey: String,
    operationName: String,
    variablesJson: String,
    promise: Promise,
  ) {
    scope.launch {
      runCatching {
        val instance = requireInstance(instanceKey)
        val payload = JsonBridge.parseVariables(variablesJson)
        val ref = instance.mutation(
          operationName = operationName,
          variables = payload.values,
          dataDeserializer = AnyValueSerializer,
          variablesSerializer = VariablesSerializer(payload.keys),
        )
        val result = ref.execute()
        // Mutations never read the cache, so the source is always the server.
        JsonBridge.stringifyResult(result.data, "server")
      }.fold(
        onSuccess = { promise.resolve(it) },
        onFailure = { rejectWith(promise, it, operationName) },
      )
    }
  }

  // MARK: subscriptions

  override fun subscribe(
    instanceKey: String,
    subId: String,
    operationName: String,
    variablesJson: String,
    promise: Promise,
  ) {
    val scopedId = "$instanceKey::$subId"
    // Started lazily so the job is registered before it can run. Registering
    // afterwards leaves a window where a fast failure reports nothing because
    // the map does not know about the subscription yet.
    val job = scope.launch(start = CoroutineStart.LAZY) {
      runCatching {
        val ref = queryRef(instanceKey, operationName, variablesJson)
        ref.subscribe().flow.collect { update ->
          update.result.fold(
            onSuccess = { value ->
              emitEvent(subId, JsonBridge.stringifyResult(value.data, sourceName(value.dataSource)))
            },
            onFailure = { error ->
              emitEvent(subId, JsonBridge.stringifyError(NormalizedError.from(error, operationName)))
            },
          )
        }
      }.onFailure { error ->
        // Cancellation is how unsubscribe works, so it is not an error worth
        // reporting. Rethrowing also keeps structured concurrency intact, which
        // runCatching would otherwise swallow.
        if (error is CancellationException) {
          throw error
        }
        if (subscriptions.containsKey(scopedId)) {
          emitEvent(subId, JsonBridge.stringifyError(NormalizedError.from(error, operationName)))
        }
      }
    }
    subscriptions[scopedId] = job
    job.start()
    promise.resolve(null)
  }

  override fun unsubscribe(subId: String, promise: Promise) {
    val scopedId = subscriptions.keys.firstOrNull { it.endsWith("::$subId") }
    scopedId?.let { subscriptions.remove(it)?.cancel() }
    // Unknown ids resolve quietly. JS may cancel before the start call settled.
    promise.resolve(null)
  }

  // MARK: diagnostics

  override fun getDiagnostics(instanceKey: String, promise: Promise) {
    scope.launch {
      runCatching {
        val app = instanceApps[instanceKey]
        val json = JSONObject()
        json.put("instanceKey", instanceKey)
        json.put("configured", instances.containsKey(instanceKey))
        val ids = subscriptions.keys.filter { it.startsWith("$instanceKey::") }
          .map { it.substringAfter("::") }
        json.put("activeSubscriptions", ids.size)
        json.put("subscriptionIds", JsonBridge.toJsonNode(ids))
        val user = app?.let { currentUser(it) }
        json.put("hasCurrentUser", user != null)
        json.put("uid", user ?: JSONObject.NULL)
        json.put("appCheckConfigured", app != null && isAppCheckAvailable())
        json.toString()
      }.fold(
        onSuccess = { promise.resolve(it) },
        onFailure = { rejectWith(promise, it, null) },
      )
    }
  }

  override fun invalidate() {
    // Fast Refresh tears the JS context down without telling JS code. Without
    // this every reload would leave its gRPC streams running.
    subscriptions.values.forEach { it.cancel() }
    subscriptions.clear()
    instances.values.forEach { runCatching { it.close() } }
    instances.clear()
    instanceApps.clear()
    scope.cancel()
    super.invalidate()
  }

  // MARK: helpers

  private fun requireInstance(instanceKey: String): FirebaseDataConnect =
    instances[instanceKey]
      ?: throw IllegalStateException(
        "Data Connect instance $instanceKey is not configured. This is a bug in rn-sql-connect: " +
          "configure() should always run before any operation.",
      )

  private fun queryRef(
    instanceKey: String,
    operationName: String,
    variablesJson: String,
  ): QueryRef<AnyValue, Map<String, AnyValue?>> {
    val instance = requireInstance(instanceKey)
    val payload = JsonBridge.parseVariables(variablesJson)
    return instance.query(
      operationName = operationName,
      variables = payload.values,
      dataDeserializer = AnyValueSerializer,
      variablesSerializer = VariablesSerializer(payload.keys),
    )
  }

  private fun parseSettings(settingsJson: String?): DataConnectSettings {
    if (settingsJson.isNullOrBlank()) {
      return DataConnectSettings()
    }
    val json = JSONObject(settingsJson)
    val host = json.optString("host").takeIf { it.isNotEmpty() }
    val sslEnabled = if (json.has("sslEnabled")) json.getBoolean("sslEnabled") else true
    val cache = if (json.has("cacheStorage") || json.has("cacheMaxAgeSeconds")) {
      CacheSettings(
        storage = when (json.optString("cacheStorage", "persistent")) {
          "memory" -> CacheSettings.Storage.MEMORY
          else -> CacheSettings.Storage.PERSISTENT
        },
        maxAge = json.optDouble("cacheMaxAgeSeconds", 0.0).seconds,
      )
    } else {
      null
    }
    val defaults = DataConnectSettings()
    return DataConnectSettings(
      host = host ?: defaults.host,
      sslEnabled = sslEnabled,
      cacheSettings = cache,
    )
  }

  private fun parseFetchPolicy(value: String): QueryRef.FetchPolicy =
    when (value) {
      "CACHE_ONLY" -> QueryRef.FetchPolicy.CACHE_ONLY
      "SERVER_ONLY" -> QueryRef.FetchPolicy.SERVER_ONLY
      else -> QueryRef.FetchPolicy.PREFER_CACHE
    }

  private fun sourceName(source: DataSource): String =
    if (source == DataSource.CACHE) "cache" else "server"

  private fun emitEvent(subId: String, payloadJson: String) {
    val map = Arguments.createMap()
    map.putString("subId", subId)
    map.putString("payloadJson", payloadJson)
    emitOnQueryEvent(map)
  }

  private fun rejectWith(promise: Promise, throwable: Throwable, operationName: String?) {
    val normalized = NormalizedError.from(throwable, operationName)
    val userInfo = Arguments.createMap()
    userInfo.putString("details", normalized.toJson().toString())
    promise.reject(normalized.code, normalized.message, userInfo)
  }

  /**
   * Reads the signed-in user through reflection so that apps without
   * firebase-auth on the classpath still load this module.
   */
  private fun currentUser(app: FirebaseApp): String? = runCatching {
    val authClass = Class.forName("com.google.firebase.auth.FirebaseAuth")
    val auth = authClass.getMethod("getInstance", FirebaseApp::class.java).invoke(null, app)
    val user = authClass.getMethod("getCurrentUser").invoke(auth) ?: return@runCatching null
    user.javaClass.getMethod("getUid").invoke(user) as? String
  }.getOrNull()

  private fun isAppCheckAvailable(): Boolean = runCatching {
    Class.forName("com.google.firebase.appcheck.FirebaseAppCheck")
    true
  }.getOrDefault(false)

  companion object {
    const val NAME = "RnSqlConnect"
  }
}
