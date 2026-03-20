require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoSherpaOnnx'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '15.1',
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/tirth0/expo-sherpa-onnx' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files = "sherpa-onnx.xcframework/**/*", "onnxruntime.xcframework/**/*", "csherpa/**/*"

  s.vendored_frameworks = 'sherpa-onnx.xcframework', 'onnxruntime.xcframework'
  s.preserve_paths = 'sherpa-onnx.xcframework', 'onnxruntime.xcframework', 'csherpa'

  s.frameworks = 'Accelerate', 'CoreML'
  s.libraries = 'c++'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'HEADER_SEARCH_PATHS' => [
      '"$(PODS_TARGET_SRCROOT)/sherpa-onnx.xcframework/ios-arm64/Headers"',
      '"$(PODS_TARGET_SRCROOT)/sherpa-onnx.xcframework/ios-arm64_x86_64-simulator/Headers"',
      '"$(PODS_TARGET_SRCROOT)/onnxruntime.xcframework/Headers"',
    ].join(' '),
    'OTHER_LDFLAGS' => '-lc++',
    'SWIFT_INCLUDE_PATHS' => '"$(PODS_TARGET_SRCROOT)/csherpa"',
  }
end
