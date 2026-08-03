import FirebaseDataConnect
import Foundation

/// Platform-neutral error shape.
///
/// Apple platforms expose four unrelated error structs while Android throws a
/// tree of exceptions, so neither taxonomy maps onto the other. Both sides
/// normalise into this shape and keep the platform detail in `nativeCode`.
struct NormalizedError {
  let code: String
  let message: String
  let operationName: String?
  var graphQLErrors: [[String: Any]] = []
  var partialDataJson: String?
  var nativeCode: String?

  private func dictionary() -> [String: Any] {
    var payload: [String: Any] = [
      "code": code,
      "message": message,
      "graphQLErrors": graphQLErrors,
    ]
    payload["operationName"] = operationName ?? NSNull()
    payload["nativeCode"] = nativeCode ?? NSNull()
    return payload
  }

  /// JSON handed to `reject` as `userInfo.details`.
  func detailsJson() -> String {
    var payload = dictionary()
    // `rawJsonData` is already JSON text, so it is spliced in rather than
    // re-encoded, which would turn the object into an escaped string.
    let base = Self.encode(payload)
    guard let partialDataJson else {
      return Self.splice(base, key: "partialData", json: "null")
    }
    payload["partialData"] = nil
    return Self.splice(base, key: "partialData", json: partialDataJson)
  }

  /// Payload pushed to JS for a failing subscription update.
  func eventPayload() -> String {
    "{\"error\":\(detailsJson())}"
  }

  private static func encode(_ payload: [String: Any]) -> String {
    guard
      let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
      let text = String(data: data, encoding: .utf8)
    else {
      return "{\"code\":\"internal\",\"message\":\"error encoding failed\"}"
    }
    return text
  }

  private static func splice(_ json: String, key: String, json value: String) -> String {
    guard json.hasSuffix("}") else { return json }
    let body = String(json.dropLast())
    let separator = body.hasSuffix("{") ? "" : ","
    return "\(body)\(separator)\"\(key)\":\(value)}"
  }

  static func from(_ error: Error, operationName: String?) -> NormalizedError {
    let unwrapped: Error
    if let anyError = error as? AnyDataConnectError {
      unwrapped = anyError.dataConnectError
    } else {
      unwrapped = error
    }

    if let operationError = unwrapped as? DataConnectOperationError {
      let response = operationError.response
      let errors: [[String: Any]] = (response?.errors ?? []).map { info in
        [
          "message": info.message,
          "path": (info.path ?? []).map { segment -> Any in
            switch segment {
            case let .field(name): return name
            case let .listIndex(index): return index
            }
          },
        ]
      }
      let hasData = response?.rawJsonData != nil
      return NormalizedError(
        code: hasData ? "partial-error" : classify(operationError.message ?? ""),
        message: operationError.message ?? "Data Connect operation failed",
        operationName: operationName,
        graphQLErrors: errors,
        partialDataJson: response?.rawJsonData,
        nativeCode: "DataConnectOperationError"
      )
    }

    if let initError = unwrapped as? DataConnectInitError {
      return NormalizedError(
        code: "not-configured",
        message: initError.message ?? "Data Connect initialisation failed",
        operationName: operationName,
        nativeCode: "DataConnectInitError.\(initError.code)"
      )
    }

    if let codecError = unwrapped as? DataConnectCodecError {
      return NormalizedError(
        code: "internal",
        message: codecError.message ?? "Data Connect could not decode the response",
        operationName: operationName,
        nativeCode: "DataConnectCodecError.\(codecError.code)"
      )
    }

    if let internalError = unwrapped as? DataConnectInternalError {
      let message = internalError.message ?? "Data Connect internal error"
      return NormalizedError(
        code: classify(message),
        message: message,
        operationName: operationName,
        nativeCode: "DataConnectInternalError.\(internalError.code)"
      )
    }

    let description = String(describing: unwrapped)
    return NormalizedError(
      code: classify(description),
      message: (unwrapped as NSError).localizedDescription,
      operationName: operationName,
      nativeCode: String(describing: type(of: unwrapped))
    )
  }

  /// gRPC status names are matched from the text because the SDK does not
  /// expose the status. Best effort by design: anything unrecognised stays
  /// `internal` with the original message intact.
  private static func classify(_ text: String) -> String {
    let upper = text.uppercased()
    if upper.contains("UNAUTHENTICATED") { return "unauthenticated" }
    if upper.contains("PERMISSION_DENIED") || upper.contains("PERMISSIONDENIED") {
      return "unauthorized"
    }
    if upper.contains("NOT_FOUND") || upper.contains("NOTFOUND") { return "not-found" }
    if upper.contains("INVALID_ARGUMENT") { return "invalid-argument" }
    if upper.contains("UNAVAILABLE") || upper.contains("DEADLINE_EXCEEDED") { return "unavailable" }
    if upper.contains("CANCELLED") || upper.contains("CANCELED") { return "cancelled" }
    return "internal"
  }
}
