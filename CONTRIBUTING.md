# Contributing to expo-sherpa-onnx

Thanks for your interest in contributing! This guide covers the conventions and workflow used in this project.

## Prerequisites

- Node.js (LTS)
- npm
- Xcode (for iOS development)
- Android Studio (for Android development)
- A physical device or simulator/emulator for testing native changes

## Getting Started

```bash
git clone https://github.com/tirth0/expo-sherpa-onnx.git
cd expo-sherpa-onnx
npm install
```

To run the example app or test native changes, you also need the prebuilt
binaries. See [Building Native Binaries](#building-native-binaries) below.
TypeScript-only changes (src/, tests) do not require native binaries.

## Project Structure

```
expo-sherpa-onnx/
├── src/                  # TypeScript API layer
│   ├── __tests__/        # Jest test suites
│   ├── stt.ts            # Speech-to-text engines
│   ├── tts.ts            # Text-to-speech engine
│   ├── vad.ts            # Voice activity detection
│   ├── kws.ts            # Keyword spotting
│   ├── speaker.ts        # Speaker embedding & manager
│   ├── diarization.ts    # Speaker diarization
│   ├── modelDetection.ts # Auto-detect model types
│   ├── utils.ts          # Shared utilities
│   └── index.ts          # Public exports
├── android/              # Kotlin native module
├── ios/                  # Swift native module
├── mocks/                # Native function mocks for testing
├── example/              # Full demo app
└── scripts/              # Tooling (badge updates, etc.)
```

## Development Workflow

### Branching

1. Fork the repository and create a branch from `main`.
2. Use descriptive branch names: `feat/streaming-vad`, `fix/tts-sample-rate`, `docs/api-reference`.

### Making Changes

**TypeScript (src/)** — all public API, engine wrappers, and utility functions live here. Each engine file follows the same pattern: a factory function that calls the native module and returns an object with bound methods.

**Native code (android/, ios/)** — Kotlin module at `android/src/main/java/expo/modules/sherpaonnx/ExpoSherpaOnnxModule.kt` and Swift module at `ios/ExpoSherpaOnnxModule.swift`. Native functions are exposed via the Expo Modules API.

**Mocks (mocks/)** — `ExpoSherpaOnnx.ts` provides mock implementations of every native function, used by the test suite. If you add or change a native function signature, update the mock to match.

### Running Tests

```bash
npm test
```

Tests run through `expo-module test` (Jest) against both iOS and Android project configs. All tests use the mock layer — no native build is required.

Run with coverage:

```bash
npm test -- --coverage
```

### Linting

```bash
npm run lint
```

Uses ESLint with the `universe/native` and `universe/web` configs. The `build/` directory is excluded.

### Pre-commit Hook

The project uses [husky](https://typicode.github.io/husky/) to run checks before each commit:

1. **Lint** — `npm run lint` must pass.
2. **Tests** — full test suite runs with coverage.
3. **Badge update** — README badges (version, test count, coverage) are regenerated from the latest results.

If any step fails, the commit is blocked. Fix the issue and try again.

### Building

```bash
npm run build     # compile TypeScript
npm run clean     # remove build artifacts
npm run prepare   # full prepare (build + husky install)
```

### Running the Example App

```bash
cd example
npx expo run:ios      # iOS
npx expo run:android  # Android
```

## Adding a New Feature

1. **Native side** — add the function in both `ExpoSherpaOnnxModule.kt` and `ExpoSherpaOnnxModule.swift` using the Expo Modules API.
2. **Mock** — add a corresponding mock in `mocks/ExpoSherpaOnnx.ts`.
3. **TypeScript wrapper** — create or extend an engine file in `src/`. Follow the existing factory-function pattern.
4. **Types** — add any new config or result types to `src/ExpoSherpaOnnx.types.ts`.
5. **Export** — re-export from `src/index.ts`.
6. **Tests** — add tests in `src/__tests__/`. Cover the happy path, error handling, and destroy/cleanup.
7. **Docs** — update `README.md` with API docs and examples.

## Code Style

- TypeScript strict mode. No `any` unless unavoidable.
- Functions that wrap native calls should validate the handle and throw if the engine was already destroyed.
- Engine objects should always expose a `destroy()` method that releases native resources.
- Prefer file-path native methods over passing large arrays across the JS bridge.

## Submitting a Pull Request

1. Make sure `npm run lint` and `npm test` pass locally.
2. Write a clear PR description explaining what changed and why.
3. If your change affects the public API, update the README.
4. Keep PRs focused — one feature or fix per PR.

## Reporting Issues

Open an issue at [github.com/tirth0/expo-sherpa-onnx/issues](https://github.com/tirth0/expo-sherpa-onnx/issues). Include:

- Device / simulator info
- Expo SDK and expo-sherpa-onnx version
- Steps to reproduce
- Relevant logs or error messages

## Building Native Binaries

The prebuilt `.xcframework` and `.so` binaries are **not** checked into git.
They ship only in the npm tarball. To develop locally with native changes, you
must build them from the upstream sherpa-onnx source.

### Upstream version

- **sherpa-onnx:** v1.12.29 (git sha1: `75022de`)
- **Repository:** https://github.com/k2-fsa/sherpa-onnx

### Prerequisites

- CMake
- Android NDK (for Android builds)
- Xcode Command Line Tools (for iOS builds)

### 1. Clone and checkout sherpa-onnx

```bash
git clone https://github.com/k2-fsa/sherpa-onnx.git
cd sherpa-onnx
git checkout 75022de
```

### 2. Build for Android

```bash
./build-android-arm64-v8a.sh
./build-android-armv7-eabi.sh
./build-android-x86-64.sh
```

Then copy the resulting `.so` files into the module (run from the sherpa-onnx directory):

```bash
mkdir -p /path/to/expo-sherpa-onnx/android/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86_64}

cp build-android-arm64-v8a-static/install/lib/libsherpa-onnx-jni.so \
   /path/to/expo-sherpa-onnx/android/src/main/jniLibs/arm64-v8a/

cp build-android-armv7-eabi-static/install/lib/libsherpa-onnx-jni.so \
   /path/to/expo-sherpa-onnx/android/src/main/jniLibs/armeabi-v7a/

cp build-android-x86-64-static/install/lib/libsherpa-onnx-jni.so \
   /path/to/expo-sherpa-onnx/android/src/main/jniLibs/x86_64/
```

### 3. Build for iOS

```bash
./build-ios.sh
```

Then copy the xcframeworks into the module. The `onnxruntime.xcframework` may be
behind a symlink (e.g. `build-ios/ios-onnxruntime/onnxruntime.xcframework` ->
`1.17.1/onnxruntime.xcframework`), so use `cp -RLa` to dereference symlinks:

```bash
cp -RLa build-ios/sherpa-onnx.xcframework /path/to/expo-sherpa-onnx/ios/
cp -RLa build-ios/ios-onnxruntime/1.17.1/onnxruntime.xcframework /path/to/expo-sherpa-onnx/ios/
```

> **Tip:** If the symlink target has changed, resolve it manually:
> `ls -la build-ios/ios-onnxruntime/onnxruntime.xcframework` to see
> where it points, then copy the real directory.

### 4. Verify

From the module root, run:

```bash
node scripts/verify-binaries.js
```

This checks that all required binary directories exist and are non-empty.
The same check runs automatically during `npm publish`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
