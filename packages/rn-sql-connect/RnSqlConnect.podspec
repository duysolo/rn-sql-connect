require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
sdk_versions = package["sdkVersions"]["ios"]

# Firebase version follows react-native-firebase when it is installed, so the
# version can only ever come from one place. `$FirebaseSDKVersion` is the escape
# hatch react-native-firebase itself documents.
firebase_version = $FirebaseSDKVersion
if firebase_version.nil?
  begin
    rnfb_package_json = Pod::Executable.execute_command("node", ["-p",
      "require.resolve('@react-native-firebase/app/package.json', {paths: [process.argv[1]]})",
      __dir__]).strip
    firebase_version = JSON.parse(File.read(rnfb_package_json))["sdkVersions"]["ios"]["firebase"]
  rescue StandardError
    firebase_version = sdk_versions["firebase"]
  end
end

# rn-sql-connect needs the SAME Firebase instance that react-native-firebase
# configures, otherwise Data Connect cannot see the signed-in user or the App
# Check token. That rules out Swift Package Manager for the Firebase side:
# firebase-ios-sdk declares its products with the automatic type, so SwiftPM
# links a private copy of FirebaseCore into every framework that depends on it
# and each copy keeps its own registry of configured apps. A react-native-firebase
# maintainer confirmed there is no way to share an instance in that mode:
# https://github.com/invertase/react-native-firebase/issues/9140
#
# So Firebase comes from CocoaPods here, exactly like react-native-firebase in
# its CocoaPods mode, and the Data Connect sources are vendored under
# ios/vendor rather than pulled as a Swift Package. Only grpc-swift stays on
# SPM, which is safe because nothing else in a React Native app links it.
unless defined?($RNFirebaseDisableSPM) && $RNFirebaseDisableSPM == true
  raise <<~ERROR
    [rn-sql-connect] react-native-firebase is resolving Firebase through Swift Package
    Manager, and this package resolves it through CocoaPods. Two copies of
    FirebaseCore in one process means Data Connect cannot see the app that
    react-native-firebase configured, so every call fails with not-configured.

    Add this to your Podfile, before any target block:

      $RNFirebaseDisableSPM = true

    Background: https://github.com/invertase/react-native-firebase/issues/9140
  ERROR
end

Pod::Spec.new do |s|
  s.name         = "RnSqlConnect"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/duysolo/rn-sql-connect"
  s.license      = package["license"]
  s.authors      = "duysolo"
  s.platforms    = { :ios => sdk_versions["iosTarget"] }
  s.source       = { :git => "https://github.com/duysolo/rn-sql-connect.git", :tag => "v#{s.version}" }

  # Includes ios/vendor/FirebaseDataConnect, the vendored Data Connect SDK.
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.preserve_paths = "ios/vendor/**/LICENSE"

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_VERSION" => "5.9",
  }

  install_modules_dependencies(s)

  # The same pods react-native-firebase uses in CocoaPods mode, so there is one
  # FirebaseCore in the process and Data Connect reads the app, the user and the
  # App Check token that react-native-firebase set up.
  s.dependency "Firebase/CoreOnly", firebase_version
  s.dependency "FirebaseAuth", firebase_version
  s.dependency "FirebaseAppCheckInterop", firebase_version
  s.dependency "FirebaseCoreExtension", firebase_version
  s.dependency "GoogleUtilities/Environment"

  # gRPC has no CocoaPods distribution, and nothing else in a React Native app
  # links grpc-swift, so a Swift Package here cannot collide with anything.
  if defined?(spm_dependency)
    spm_dependency(s,
      url: "https://github.com/grpc/grpc-swift.git",
      requirement: { kind: "exactVersion", version: sdk_versions["grpcSwift"] },
      products: ["GRPC"]
    )
  else
    raise <<~ERROR
      [rn-sql-connect] This React Native version does not provide `spm_dependency`.
      rn-sql-connect requires React Native 0.85 or newer.
    ERROR
  end
end
