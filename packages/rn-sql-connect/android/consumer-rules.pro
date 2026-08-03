# kotlinx.serialization keeps its metadata in annotations and synthetic members.
# Without these rules R8 strips them and serialization only breaks in release
# builds, which is the most expensive kind of breakage to find.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,InnerClasses,Signature

-keepclassmembers class kotlinx.serialization.json.** {
  *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
  kotlinx.serialization.KSerializer serializer(...);
}

# The Data Connect SDK recognises AnyValueSerializer by identity while encoding
# and decoding, so it must survive as a singleton.
-keep class com.google.firebase.dataconnect.serializers.AnyValueSerializer { *; }
-keep class com.google.firebase.dataconnect.AnyValue { *; }

-keep class com.rnsqlconnect.** { *; }
