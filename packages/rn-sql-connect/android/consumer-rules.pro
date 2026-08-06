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

# Data Connect talks protobuf, and protobuf-javalite looks its fields up by NAME
# at runtime: MessageSchema reads the names out of the info string passed to
# newMessageInfo() and calls Class.getDeclaredField on them. R8 renames the
# fields without touching that string, so a minified app dies on the very first
# operation with
#   Field kind_ for j6.N0 not found. Known fields are [... j6.N0.e, ...]
# where j6.N0 is com.google.protobuf.Value. Neither protobuf-javalite nor
# firebase-dataconnect ships a rule for this, so this package carries it for its
# consumers. Debug builds are not minified, which is why this only ever shows up
# in release.
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite {
  <fields>;
}
-dontwarn com.google.protobuf.**

# The Data Connect SDK recognises AnyValueSerializer by identity while encoding
# and decoding, so it must survive as a singleton.
-keep class com.google.firebase.dataconnect.serializers.AnyValueSerializer { *; }
-keep class com.google.firebase.dataconnect.AnyValue { *; }

-keep class com.rnsqlconnect.** { *; }
