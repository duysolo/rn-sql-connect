import FirebaseDataConnect
import Foundation

/// A JSON value.
///
/// The Apple Data Connect SDK encodes variables with `JSONEncoder` and decodes
/// results with `JSONDecoder` (see `ProtoCodec`), so one generic Codable tree is
/// enough to run any operation without generating Swift per connector.
enum JSONValue: Codable, Hashable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
    } else {
      throw DecodingError.dataCorruptedError(
        in: container,
        debugDescription: "Unsupported JSON value"
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null:
      try container.encodeNil()
    case let .bool(value):
      try container.encode(value)
    case let .number(value):
      // Whole numbers are written without a fractional part so that a count of
      // 3 does not reach JavaScript looking different from the web SDK.
      if value == value.rounded(), abs(value) < 1e15 {
        try container.encode(Int64(value))
      } else {
        try container.encode(value)
      }
    case let .string(value):
      try container.encode(value)
    case let .array(value):
      try container.encode(value)
    case let .object(value):
      try container.encode(value)
    }
  }
}

/// Dynamic coding key, needed because variable names are only known at runtime.
struct AnyCodingKey: CodingKey {
  let stringValue: String
  let intValue: Int?

  init(stringValue: String) {
    self.stringValue = stringValue
    intValue = nil
  }

  init?(intValue: Int) {
    stringValue = String(intValue)
    self.intValue = intValue
  }
}

/// Operation variables carried as a JSON object.
struct AnyJSONVariables: OperationVariable {
  let values: [String: JSONValue]

  init(values: [String: JSONValue]) {
    self.values = values
  }

  init(json: String) throws {
    let trimmed = json.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || trimmed == "{}" {
      values = [:]
      return
    }
    guard let data = trimmed.data(using: .utf8) else {
      throw RnSqlConnectError.invalidVariables
    }
    values = try JSONDecoder().decode([String: JSONValue].self, from: data)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: AnyCodingKey.self)
    for (key, value) in values {
      try container.encode(value, forKey: AnyCodingKey(stringValue: key))
    }
  }
}

/// Operation result carried as a JSON value.
struct AnyJSONData: Decodable, Sendable {
  let value: JSONValue

  init(from decoder: Decoder) throws {
    value = try JSONValue(from: decoder)
  }

  /// Serialises the result for the bridge. Sorted keys keep payloads stable,
  /// which makes diffing two runs during migration meaningful.
  func jsonString() throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let data = try encoder.encode(value)
    return String(decoding: data, as: UTF8.self)
  }
}

enum RnSqlConnectError: Error {
  case invalidVariables
  case notConfigured(String)
  case unexpectedRefType
}
