require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
sdk_versions = package["sdkVersions"]["ios"]

# rn-sql-connect resolves FirebaseCore through react-native-firebase's helper so
# that both packages end up on exactly one copy of the Firebase Apple SDK. Doing
# it any other way means two Firebase copies in one binary, where the Data
# Connect side sees a FirebaseApp that was never configured.
begin
  # Resolved through package.json, not through the .rb file directly: the
  # package's `exports` map does not expose the Ruby helper, so asking node for
  # it fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
  rnfb_package_json = Pod::Executable.execute_command("node", ["-p",
    "require.resolve('@react-native-firebase/app/package.json', {paths: [process.argv[1]]})",
    __dir__]).strip
  rnfb_dir = File.dirname(rnfb_package_json)
  require File.join(rnfb_dir, "firebase_spm")
  # Read the Firebase version from react-native-firebase itself rather than
  # pinning our own. One package decides the version, always.
  rnfb_package = JSON.parse(File.read(rnfb_package_json))
  $RNSqlConnectFirebaseVersion = rnfb_package["sdkVersions"]["ios"]["firebase"]
  $RNSqlConnectHasRNFBSpm = true
rescue StandardError => e
  Pod::UI.warn "[rn-sql-connect] Could not load @react-native-firebase/app/firebase_spm.rb (#{e.message})."
  Pod::UI.warn "[rn-sql-connect] Install @react-native-firebase/app >= 26.1.0. iOS support depends on it."
  $RNSqlConnectHasRNFBSpm = false
end

# Static linkage cannot work here, so fail during `pod install` with an
# explanation rather than leaving a wall of duplicate-symbol linker output.
#
# Reason: firebase-ios-sdk's Swift Package only declares dynamic library
# products. Under `use_frameworks! :linkage => :static` every pod that resolves
# Firebase through SPM embeds its own copy. react-native-firebase raises for the
# same reason; see `rnfirebase_fail_if_spm_static_linkage!`.
def rn_sql_connect_fail_if_static_linkage!(installer)
  static_targets = installer.aggregate_targets.select do |target|
    target.target_definition.build_type.static?
  end
  return if static_targets.empty?

  raise <<~ERROR
    [rn-sql-connect] SPM plus static linkage is not supported (target(s): #{static_targets.map(&:name).join(', ')}).

    FirebaseDataConnect is only available through Swift Package Manager, and
    firebase-ios-sdk's Swift Package only ships dynamic library products.

    Fix it with:
      use_frameworks! :linkage => :dynamic

    See docs/ios-spm.md for the full migration notes.
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

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
    "SWIFT_VERSION" => "5.9",
  }

  install_modules_dependencies(s)

  # FirebaseDataConnect ships through Swift Package Manager only. There is no
  # CocoaPods spec for it and there never will be: Firebase stops publishing to
  # CocoaPods in October 2026.
  if defined?(spm_dependency)
    spm_dependency(s,
      url: sdk_versions["dataConnectSpmUrl"],
      requirement: { kind: "upToNextMajorVersion", minimumVersion: sdk_versions["dataConnect"] },
      products: ["FirebaseDataConnect"]
    )
  else
    raise <<~ERROR
      [rn-sql-connect] This React Native version does not provide `spm_dependency`.
      rn-sql-connect requires React Native 0.85 or newer, because FirebaseDataConnect
      is distributed exclusively through Swift Package Manager.
    ERROR
  end

  # FirebaseCore is deliberately NOT declared here. FirebaseDataConnect already
  # depends on it through Swift Package Manager, and adding it a second time
  # links another static copy of FirebaseCore into this framework. Three copies
  # of FIRApp then exist in one process (here, RNFBApp, and the SPM framework),
  # each with its own registry, so FirebaseApp.app() returns nil on the copy
  # this code runs against even though the app configured Firebase at launch.
end
