import Combine
import FirebaseCore
import Foundation

/// All Data Connect work lives here.
///
/// The TurboModule shim in `RnSqlConnect.mm` only marshals arguments, so this
/// class stays plain Swift and can be exercised from tests without React
/// Native present.
@available(iOS 15.0, *)
@objc(RnSqlConnectCore)
public final class RnSqlConnectCore: NSObject {

  private struct Instance {
    let dataConnect: DataConnect
    let app: FirebaseApp
  }

  private var instances: [String: Instance] = [:]
  private var subscriptions: [String: AnyCancellable] = [:]
  private var subscriptionInstanceKeys: [String: String] = [:]
  /// Ids cancelled before their subscription finished starting. Without this,
  /// an unsubscribe that arrives during the start hop is lost and the stream
  /// keeps running with nobody listening.
  private var cancelledSubIds: Set<String> = []
  private let lock = NSLock()

  /// Called for every subscription update. Set by the TurboModule shim.
  @objc public var onEvent: ((String, String) -> Void)?

  // MARK: - Lifecycle

  @objc public func configure(
    instanceKey: String,
    appName: String,
    connector: String,
    location: String,
    serviceId: String,
    settingsJson: String?,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, String) -> Void
  ) {
    lock.lock()
    defer { lock.unlock() }

    if instances[instanceKey] != nil {
      resolve(nil)
      return
    }

    guard let app = firebaseApp(named: appName) else {
      let error = NormalizedError(
        code: "not-configured",
        message: "Firebase app \"\(appName)\" is not configured. rn-sql-connect requires "
          + "@react-native-firebase/app to have configured Firebase before use.",
        operationName: nil
      )
      reject(error.code, error.message, error.detailsJson())
      return
    }

    let config = ConnectorConfig(serviceId: serviceId, location: location, connector: connector)
    let settings = Self.parseSettings(settingsJson)
    let dataConnect = DataConnect.dataConnect(
      app: app,
      connectorConfig: config,
      settings: settings
    )
    instances[instanceKey] = Instance(dataConnect: dataConnect, app: app)
    resolve(nil)
  }

  @objc public func useEmulator(
    instanceKey: String,
    host: String,
    port: Int,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, String) -> Void
  ) {
    guard let instance = self.instance(for: instanceKey, reject: reject) else { return }
    if host.isEmpty {
      instance.dataConnect.useEmulator(port: port)
    } else {
      instance.dataConnect.useEmulator(host: host, port: port)
    }
    resolve(nil)
  }

  @objc public func terminate(
    instanceKey: String,
    resolve: @escaping (Any?) -> Void,
    reject _: @escaping (String, String, String) -> Void
  ) {
    lock.lock()
    let ids = subscriptionInstanceKeys.filter { $0.value == instanceKey }.map(\.key)
    for id in ids {
      subscriptions.removeValue(forKey: id)?.cancel()
      subscriptionInstanceKeys.removeValue(forKey: id)
    }
    instances.removeValue(forKey: instanceKey)
    lock.unlock()
    resolve(nil)
  }

  // MARK: - Operations

  @objc public func executeQuery(
    instanceKey: String,
    operationName: String,
    variablesJson: String,
    fetchPolicy: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, String) -> Void
  ) {
    guard let instance = self.instance(for: instanceKey, reject: reject) else { return }
    Task {
      do {
        let ref = try self.queryRef(
          instance: instance,
          operationName: operationName,
          variablesJson: variablesJson
        )
        let result = try await ref.execute(fetchPolicy: Self.parseFetchPolicy(fetchPolicy))
        let source = result.source == .cache ? "cache" : "server"
        resolve(try Self.payload(data: result.data, source: source))
      } catch {
        let normalized = NormalizedError.from(error, operationName: operationName)
        reject(normalized.code, normalized.message, normalized.detailsJson())
      }
    }
  }

  @objc public func executeMutation(
    instanceKey: String,
    operationName: String,
    variablesJson: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, String) -> Void
  ) {
    guard let instance = self.instance(for: instanceKey, reject: reject) else { return }
    Task {
      do {
        let variables = try AnyJSONVariables(json: variablesJson)
        let ref = instance.dataConnect.mutation(
          name: operationName,
          variables: variables,
          resultsDataType: AnyJSONData.self
        )
        let result = try await ref.execute()
        // Mutations never read the cache.
        resolve(try Self.payload(data: result.data, source: "server"))
      } catch {
        let normalized = NormalizedError.from(error, operationName: operationName)
        reject(normalized.code, normalized.message, normalized.detailsJson())
      }
    }
  }

  // MARK: - Subscriptions

  @objc public func subscribe(
    instanceKey: String,
    subId: String,
    operationName: String,
    variablesJson: String,
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String, String) -> Void
  ) {
    guard let instance = self.instance(for: instanceKey, reject: reject) else { return }
    Task { @MainActor in
      do {
        let ref = try self.queryRef(
          instance: instance,
          operationName: operationName,
          variablesJson: variablesJson
        )
        let publisher = try await ref.subscribe()
        let cancellable = publisher.sink { [weak self] result in
          guard let self else { return }
          switch result {
          case let .success(operationResult):
            // A nil payload means the cache had nothing yet. Forwarding that as
            // an empty result would look like a real answer and could clear a
            // screen that already has data, so it is skipped.
            guard let data = operationResult.data else { return }
            let source = operationResult.source == .cache ? "cache" : "server"
            if let payload = try? Self.payload(data: data, source: source) {
              self.onEvent?(subId, payload)
            }
          case let .failure(error):
            let normalized = NormalizedError.from(error, operationName: operationName)
            self.onEvent?(subId, normalized.eventPayload())
          }
        }
        self.lock.lock()
        if self.cancelledSubIds.remove(subId) != nil {
          self.lock.unlock()
          cancellable.cancel()
          resolve(nil)
          return
        }
        self.subscriptions[subId] = cancellable
        self.subscriptionInstanceKeys[subId] = instanceKey
        self.lock.unlock()
        resolve(nil)
      } catch {
        let normalized = NormalizedError.from(error, operationName: operationName)
        reject(normalized.code, normalized.message, normalized.detailsJson())
      }
    }
  }

  @objc public func unsubscribe(
    subId: String,
    resolve: @escaping (Any?) -> Void,
    reject _: @escaping (String, String, String) -> Void
  ) {
    lock.lock()
    if let cancellable = subscriptions.removeValue(forKey: subId) {
      subscriptionInstanceKeys.removeValue(forKey: subId)
      lock.unlock()
      cancellable.cancel()
    } else {
      // The subscription is still starting. Record the cancel so the start hop
      // tears it down instead of storing a stream nobody listens to.
      cancelledSubIds.insert(subId)
      lock.unlock()
    }
    // Unknown ids resolve quietly: JS may cancel before the start call settled.
    resolve(nil)
  }

  /// Cancels everything. Called when the React instance goes away, otherwise a
  /// Fast Refresh would leave gRPC streams running.
  @objc public func invalidate() {
    lock.lock()
    subscriptions.values.forEach { $0.cancel() }
    subscriptions.removeAll()
    subscriptionInstanceKeys.removeAll()
    cancelledSubIds.removeAll()
    instances.removeAll()
    lock.unlock()
  }

  // MARK: - Diagnostics

  @objc public func getDiagnostics(
    instanceKey: String,
    resolve: @escaping (Any?) -> Void,
    reject _: @escaping (String, String, String) -> Void
  ) {
    lock.lock()
    let instance = instances[instanceKey]
    let ids = subscriptionInstanceKeys.filter { $0.value == instanceKey }.map(\.key).sorted()
    lock.unlock()

    var payload: [String: Any] = [
      "instanceKey": instanceKey,
      "configured": instance != nil,
      "activeSubscriptions": ids.count,
      "subscriptionIds": ids,
    ]

    let uid = instance.flatMap { Self.currentUserUid(app: $0.app) }
    payload["hasCurrentUser"] = uid != nil
    if let uid {
      payload["uid"] = uid
    }
    payload["appCheckConfigured"] = Self.isAppCheckAvailable()

    let data = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data("{}".utf8)
    resolve(String(decoding: data, as: UTF8.self))
  }

  // MARK: - Helpers

  private func instance(
    for key: String,
    reject: @escaping (String, String, String) -> Void
  ) -> Instance? {
    lock.lock()
    let found = instances[key]
    lock.unlock()
    if let found {
      return found
    }
    let error = NormalizedError(
      code: "not-configured",
      message: "Data Connect instance \(key) is not configured. This is a bug in rn-sql-connect: "
        + "configure() should always run before any operation.",
      operationName: nil
    )
    reject(error.code, error.message, error.detailsJson())
    return nil
  }

  private func queryRef(
    instance: Instance,
    operationName: String,
    variablesJson: String
  ) throws -> QueryRefObservableObject<AnyJSONData, AnyJSONVariables> {
    let variables = try AnyJSONVariables(json: variablesJson)
    let ref = instance.dataConnect.query(
      name: operationName,
      variables: variables,
      resultsDataType: AnyJSONData.self,
      publisher: .observableObject
    )
    guard let typed = ref as? QueryRefObservableObject<AnyJSONData, AnyJSONVariables> else {
      throw RnSqlConnectError.unexpectedRefType
    }
    return typed
  }

  private static func payload(data: AnyJSONData?, source: String) throws -> String {
    let dataJson = try data?.jsonString() ?? "null"
    return "{\"data\":\(dataJson),\"source\":\"\(source)\"}"
  }

  private func firebaseApp(named name: String) -> FirebaseApp? {
    if name == "[DEFAULT]" {
      return FirebaseApp.app()
    }
    return FirebaseApp.app(name: name)
  }

  private static func parseSettings(_ json: String?) -> DataConnectSettings {
    guard
      let json,
      let data = json.data(using: .utf8),
      let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return DataConnectSettings()
    }

    let defaults = DataConnectSettings()
    var cache: CacheSettings?
    if raw["cacheStorage"] != nil || raw["cacheMaxAgeSeconds"] != nil {
      let storage: CacheSettings.Storage =
        (raw["cacheStorage"] as? String) == "memory" ? .memory : .persistent
      let maxAge = (raw["cacheMaxAgeSeconds"] as? NSNumber)?.doubleValue ?? 0
      cache = CacheSettings(storage: storage, maxAge: maxAge)
    }

    return DataConnectSettings(
      host: raw["host"] as? String ?? defaults.host,
      port: defaults.port,
      sslEnabled: raw["sslEnabled"] as? Bool ?? defaults.sslEnabled,
      cacheSettings: cache
    )
  }

  private static func parseFetchPolicy(_ value: String) -> QueryFetchPolicy {
    switch value {
    case "CACHE_ONLY": return .cacheOnly
    case "SERVER_ONLY": return .serverOnly
    default: return .preferCache
    }
  }

  /// Reads the signed-in user without linking FirebaseAuth directly, so apps
  /// that do not install @react-native-firebase/auth still load this module.
  private static func currentUserUid(app: FirebaseApp) -> String? {
    guard let authClass = NSClassFromString("FIRAuth") as? NSObject.Type else {
      return nil
    }
    let selector = NSSelectorFromString("authWithApp:")
    guard authClass.responds(to: selector) else { return nil }
    let auth = authClass.perform(selector, with: app)?.takeUnretainedValue() as? NSObject
    let user = auth?.value(forKey: "currentUser") as? NSObject
    return user?.value(forKey: "uid") as? String
  }

  private static func isAppCheckAvailable() -> Bool {
    NSClassFromString("FIRAppCheck") != nil
  }
}
