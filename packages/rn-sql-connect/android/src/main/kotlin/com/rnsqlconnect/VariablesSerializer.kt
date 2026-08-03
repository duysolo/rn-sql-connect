package com.rnsqlconnect

import com.google.firebase.dataconnect.AnyValue
import com.google.firebase.dataconnect.serializers.AnyValueSerializer
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Encoder

/**
 * Serialises an arbitrary JSON object as Data Connect operation variables.
 *
 * Why this exists: the SDK has no public untyped entry point. Its own
 * `DataConnectUntypedVariables` is `internal`, and generated SDKs declare a
 * `@Serializable` class per operation, which would mean shipping generated
 * Kotlin for every connector and rebuilding the app whenever an operation
 * changes.
 *
 * How it works, and why it is not a hack: the SDK's proto encoder accepts
 * StructureKind.CLASS and gives [AnyValueSerializer] special treatment, writing
 * the wrapped protobuf value straight through. So a descriptor built at runtime
 * with one element per variable, whose elements are encoded with
 * [AnyValueSerializer], produces exactly the Struct the wire format expects.
 * Both behaviours are part of the SDK's public contract: `AnyValue` is public
 * API and is documented as the mapping for the GraphQL `Any` scalar.
 *
 * Nulls take the [kotlinx.serialization.encoding.CompositeEncoder.encodeNullableSerializableElement]
 * path so that an explicit JSON null reaches the server as null. That is not
 * the same as omitting the variable, and Data Connect mutations act on the
 * difference.
 */
internal class VariablesSerializer(
  private val keys: List<String>,
) : SerializationStrategy<Map<String, AnyValue?>> {

  override val descriptor: SerialDescriptor =
    buildClassSerialDescriptor(DESCRIPTOR_NAME) {
      keys.forEach { key -> element(key, AnyValueSerializer.descriptor) }
    }

  override fun serialize(encoder: Encoder, value: Map<String, AnyValue?>) {
    val composite = encoder.beginStructure(descriptor)
    keys.forEachIndexed { index, key ->
      when (val item = value[key]) {
        null -> composite.encodeNullableSerializableElement(descriptor, index, AnyValueSerializer, null)
        else -> composite.encodeSerializableElement(descriptor, index, AnyValueSerializer, item)
      }
    }
    composite.endStructure(descriptor)
  }

  private companion object {
    const val DESCRIPTOR_NAME = "com.rnsqlconnect.Variables"
  }
}
