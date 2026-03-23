# expo-sherpa-onnx

> **Warning**
> This is an **unstable, work-in-progress** version. APIs may change without notice. Not recommended for production use yet.

![version](https://img.shields.io/badge/version-0.0.1-blue)
![platforms](https://img.shields.io/badge/platforms-android%20%7C%20ios-lightgrey)
![tests](https://img.shields.io/badge/tests-316%20passed-brightgreen)
![statements](https://img.shields.io/badge/coverage%3A%20statements-87.34%25-yellow)
![lines](https://img.shields.io/badge/coverage%3A%20lines-87.01%25-yellow)
![functions](https://img.shields.io/badge/coverage%3A%20functions-92.42%25-brightgreen)
![branches](https://img.shields.io/badge/coverage%3A%20branches-60.6%25-orange)

Expo module wrapping [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) for on-device speech processing in React Native. Runs fully offline on Android and iOS — no network calls, no cloud APIs.

## Features

- **Offline Speech-to-Text** — Whisper, SenseVoice, Paraformer, Transducer, NeMo CTC, Moonshine
- **Streaming Speech-to-Text** — real-time recognition from microphone input
- **Text-to-Speech** — VITS, Matcha, Kokoro, and more with streaming audio support
- **Voice Activity Detection** — Silero VAD and Ten VAD with file and live-mic modes
- **Keyword Spotting** — wake-word / hotword detection from a stream
- **Speaker Embedding** — extract voice embeddings for speaker verification and identification
- **Speaker Diarization** — segment audio by speaker with optional per-segment transcription
- **File-based Processing** — large audio files (1hr+) are read natively, bypassing the JS bridge

## Platforms

| Platform | Status    |
| -------- | --------- |
| Android  | Supported |
| iOS      | Supported |

## Installation

```bash
npx expo install expo-sherpa-onnx
```

The module requires native code, so it works with [development builds](https://docs.expo.dev/develop/development-builds/introduction/) (not Expo Go).

## Quick Start

```typescript
import { createSTT, detectSttModel } from "expo-sherpa-onnx";

// Auto-detect model type from a directory
const detected = await detectSttModel("/path/to/model-dir");

// Build config (see example app for config builders)
const engine = await createSTT({
  modelConfig: {
    tokens: "/path/to/tokens.txt",
    whisper: {
      encoder: "/path/to/encoder.onnx",
      decoder: "/path/to/decoder.onnx",
    },
  },
});

// Transcribe from file (native read, no JS bridge overhead)
const result = await engine.transcribeFile("/path/to/audio.wav");
console.log(result.text);

await engine.destroy();
```

## API Reference

### Factory Functions

All factory functions return engine objects that must be `destroy()`'d when no longer needed.

#### Speech-to-Text

```typescript
import { createSTT, createStreamingSTT } from 'expo-sherpa-onnx';

// Offline (file/batch processing)
const engine = await createSTT(config: OfflineRecognizerConfig);

// Online (streaming/real-time)
const engine = await createStreamingSTT(config: OnlineRecognizerConfig);
```

#### Text-to-Speech

```typescript
import { createTTS } from 'expo-sherpa-onnx';

const engine = await createTTS(config: OfflineTtsConfig);
```

#### Voice Activity Detection

```typescript
import { createVAD } from 'expo-sherpa-onnx';

const vad = await createVAD(config: VadModelConfig, bufferSizeInSeconds?: number);
```

#### Keyword Spotting

```typescript
import { createKeywordSpotter } from 'expo-sherpa-onnx';

const spotter = await createKeywordSpotter(config: KeywordSpotterConfig);
```

#### Speaker Embedding

```typescript
import {
  createSpeakerEmbeddingExtractor,
  createSpeakerEmbeddingManager,
} from 'expo-sherpa-onnx';

const extractor = await createSpeakerEmbeddingExtractor(config: SpeakerEmbeddingExtractorConfig);
const manager = await createSpeakerEmbeddingManager(dim: number);
```

#### Speaker Diarization

```typescript
import { createOfflineSpeakerDiarization } from 'expo-sherpa-onnx';

const engine = await createOfflineSpeakerDiarization(config: OfflineSpeakerDiarizationConfig);
```

---

### Engine Methods

#### `OfflineSTTEngine`

| Method              | Signature                                                                      | Description                         |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| `transcribeSamples` | `(samples: number[], sampleRate?: number) => Promise<OfflineRecognizerResult>` | Transcribe raw PCM samples          |
| `transcribeFile`    | `(filePath: string) => Promise<OfflineRecognizerResult>`                       | Transcribe a WAV file (native read) |
| `destroy`           | `() => Promise<void>`                                                          | Release native resources            |

```typescript
const result = await engine.transcribeFile("/path/to/audio.wav");
// result.text, result.tokens, result.timestamps, result.lang
```

#### `OnlineSTTEngine`

| Method         | Signature                                         | Description                 |
| -------------- | ------------------------------------------------- | --------------------------- |
| `createStream` | `(hotwords?: string) => Promise<OnlineSTTStream>` | Create a recognition stream |
| `destroy`      | `() => Promise<void>`                             | Release native resources    |

**`OnlineSTTStream`** methods:

| Method           | Signature                                                   | Description                       |
| ---------------- | ----------------------------------------------------------- | --------------------------------- |
| `acceptWaveform` | `(samples: number[], sampleRate?: number) => Promise<void>` | Feed audio samples                |
| `inputFinished`  | `() => Promise<void>`                                       | Signal end of audio               |
| `decode`         | `() => Promise<void>`                                       | Run the decoder                   |
| `isReady`        | `() => Promise<boolean>`                                    | Check if enough data for decode   |
| `isEndpoint`     | `() => Promise<boolean>`                                    | Check if an endpoint was detected |
| `getResult`      | `() => Promise<OnlineRecognizerResult>`                     | Get current transcription         |
| `reset`          | `() => Promise<void>`                                       | Reset stream state                |
| `destroy`        | `() => Promise<void>`                                       | Release stream resources          |

```typescript
const stream = await engine.createStream();
await stream.acceptWaveform(audioChunk);
await stream.decode();
const result = await stream.getResult();
```

#### `OfflineTTSEngine`

| Property / Method   | Signature                                                                                         | Description                        |
| ------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `sampleRate`        | `readonly number`                                                                                 | Output sample rate                 |
| `numSpeakers`       | `readonly number`                                                                                 | Number of available speaker voices |
| `generate`          | `(text: string, sid?: number, speed?: number) => Promise<GeneratedAudio>`                         | Synthesize speech                  |
| `generateStreaming` | `(text: string, callbacks: StreamingTTSCallbacks, sid?: number, speed?: number) => Promise<void>` | Synthesize with streaming chunks   |
| `destroy`           | `() => Promise<void>`                                                                             | Release native resources           |

```typescript
const audio = await engine.generate("Hello world", 0, 1.0);
// audio.samples (number[]), audio.sampleRate
```

#### `VADEngine`

| Method             | Signature                                        | Description                        |
| ------------------ | ------------------------------------------------ | ---------------------------------- |
| `acceptWaveform`   | `(samples: number[]) => Promise<void>`           | Feed audio samples (for streaming) |
| `empty`            | `() => Promise<boolean>`                         | Check if segment queue is empty    |
| `isSpeechDetected` | `() => Promise<boolean>`                         | Current speech detection state     |
| `pop`              | `() => Promise<void>`                            | Remove front segment from queue    |
| `front`            | `() => Promise<SpeechSegment>`                   | Get front segment                  |
| `clear`            | `() => Promise<void>`                            | Clear segment queue                |
| `reset`            | `() => Promise<void>`                            | Reset VAD state                    |
| `flush`            | `() => Promise<void>`                            | Flush remaining audio              |
| `processFile`      | `(filePath: string) => Promise<SpeechSegment[]>` | Process entire WAV file natively   |
| `destroy`          | `() => Promise<void>`                            | Release native resources           |

```typescript
// File-based (recommended for batch processing)
const segments = await vad.processFile("/path/to/audio.wav");
for (const seg of segments) {
  console.log(
    `Speech at sample ${seg.start}, duration: ${seg.samples.length} samples`
  );
}
```

#### `KeywordSpotterEngine`

| Method         | Signature                                       | Description                       |
| -------------- | ----------------------------------------------- | --------------------------------- |
| `createStream` | `(keywords?: string) => Promise<KeywordStream>` | Create a keyword detection stream |
| `destroy`      | `() => Promise<void>`                           | Release native resources          |

**`KeywordStream`** methods:

| Method           | Signature                                                   | Description              |
| ---------------- | ----------------------------------------------------------- | ------------------------ |
| `acceptWaveform` | `(samples: number[], sampleRate?: number) => Promise<void>` | Feed audio samples       |
| `isReady`        | `() => Promise<boolean>`                                    | Check if ready to decode |
| `decode`         | `() => Promise<void>`                                       | Run the decoder          |
| `getResult`      | `() => Promise<KeywordSpotterResult>`                       | Get spotted keyword      |
| `reset`          | `() => Promise<void>`                                       | Reset stream state       |
| `destroy`        | `() => Promise<void>`                                       | Release stream resources |

#### `SpeakerEmbeddingExtractorEngine`

| Method                     | Signature                                 | Description                                   |
| -------------------------- | ----------------------------------------- | --------------------------------------------- |
| `dim`                      | `() => Promise<number>`                   | Get embedding dimension                       |
| `createStream`             | `() => Promise<SpeakerEmbeddingStream>`   | Create extraction stream                      |
| `computeEmbeddingFromFile` | `(filePath: string) => Promise<number[]>` | Extract embedding from WAV file (native read) |
| `destroy`                  | `() => Promise<void>`                     | Release native resources                      |

**`SpeakerEmbeddingStream`** methods:

| Method           | Signature                                                   | Description                  |
| ---------------- | ----------------------------------------------------------- | ---------------------------- |
| `acceptWaveform` | `(samples: number[], sampleRate?: number) => Promise<void>` | Feed audio samples           |
| `isReady`        | `() => Promise<boolean>`                                    | Check if ready to compute    |
| `compute`        | `() => Promise<number[]>`                                   | Compute the embedding vector |
| `destroy`        | `() => Promise<void>`                                       | Release stream resources     |

```typescript
// File-based (single native round-trip)
const embedding = await extractor.computeEmbeddingFromFile(
  "/path/to/speaker.wav"
);
await manager.add("Alice", embedding);
```

#### `SpeakerEmbeddingManagerEngine`

| Method            | Signature                                                                    | Description                       |
| ----------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| `add`             | `(name: string, embedding: number[]) => Promise<boolean>`                    | Enroll a speaker                  |
| `addList`         | `(name: string, embeddings: number[][]) => Promise<boolean>`                 | Enroll with multiple embeddings   |
| `remove`          | `(name: string) => Promise<boolean>`                                         | Remove a speaker                  |
| `search`          | `(embedding: number[], threshold: number) => Promise<string>`                | Find closest matching speaker     |
| `verify`          | `(name: string, embedding: number[], threshold: number) => Promise<boolean>` | Verify against a specific speaker |
| `contains`        | `(name: string) => Promise<boolean>`                                         | Check if speaker is enrolled      |
| `numSpeakers`     | `() => Promise<number>`                                                      | Count enrolled speakers           |
| `allSpeakerNames` | `() => Promise<string[]>`                                                    | List all enrolled speaker names   |
| `destroy`         | `() => Promise<void>`                                                        | Release native resources          |

#### `OfflineSpeakerDiarizationEngine`

| Method                     | Signature                                                                           | Description                                |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| `getSampleRate`            | `() => Promise<number>`                                                             | Get expected sample rate                   |
| `process`                  | `(samples: number[]) => Promise<DiarizationSegment[]>`                              | Diarize from samples                       |
| `processFile`              | `(filePath: string) => Promise<DiarizationSegment[]>`                               | Diarize a WAV file (native read)           |
| `transcribeAndDiarizeFile` | `(asrHandle: number, filePath: string) => Promise<TranscribedDiarizationSegment[]>` | Diarize + transcribe each segment natively |
| `setConfig`                | `(config: OfflineSpeakerDiarizationConfig) => Promise<void>`                        | Update clustering config                   |
| `destroy`                  | `() => Promise<void>`                                                               | Release native resources                   |

```typescript
// Diarize only
const segments = await engine.processFile("/path/to/meeting.wav");
// segments: [{ start: 0.0, end: 2.5, speaker: 0 }, ...]

// Diarize + transcribe (everything runs natively)
const asrEngine = await createSTT(asrConfig);
const transcript = await engine.transcribeAndDiarizeFile(
  asrEngine.handle,
  "/path/to/meeting.wav"
);
// transcript: [{ speaker: 0, start: 0.0, end: 2.5, text: "Hello everyone" }, ...]
```

---

### Utility Functions

```typescript
import {
  readWaveFile,
  getAvailableProviders,
  listModelsAtPath,
  detectSttModel,
  detectTtsModel,
} from "expo-sherpa-onnx";

// Read a WAV file into PCM samples
const wave = await readWaveFile("/path/to/audio.wav");
// wave.samples, wave.sampleRate

// List available hardware providers (e.g. 'cpu', 'coreml', 'nnapi')
const providers = getAvailableProviders();

// List model files/directories in a path
const items = await listModelsAtPath("/path/to/models", true);

// Auto-detect model type from directory contents
const sttModel = await detectSttModel("/path/to/whisper-model");
// sttModel.type === 'whisper', sttModel.files === { encoder: '...', decoder: '...' }

const ttsModel = await detectTtsModel("/path/to/vits-model");
// ttsModel.type === 'vits', ttsModel.files === { model: '...' }
```

---

### File-Based Processing

For batch processing of audio files, always prefer the file-path methods. These read WAV data on the native side, avoiding the JS bridge memory bottleneck that would occur with large audio arrays.

| Engine                            | File-path method                            | What it replaces                              |
| --------------------------------- | ------------------------------------------- | --------------------------------------------- |
| `OfflineSTTEngine`                | `transcribeFile(path)`                      | `transcribeSamples(samples)`                  |
| `VADEngine`                       | `processFile(path)`                         | manual `acceptWaveform` + `flush` loop        |
| `SpeakerEmbeddingExtractorEngine` | `computeEmbeddingFromFile(path)`            | `createStream` + `acceptWaveform` + `compute` |
| `OfflineSpeakerDiarizationEngine` | `processFile(path)`                         | `process(samples)`                            |
| `OfflineSpeakerDiarizationEngine` | `transcribeAndDiarizeFile(asrHandle, path)` | diarize + loop + transcribe per segment       |

The streaming methods (`acceptWaveform` on online STT, KWS, and live VAD) are intended for real-time mic input in small chunks and remain unchanged.

---

## Example App

The `example/` directory contains a full demo app with screens for every feature:

| Tab         | Screen                    | Description                                      |
| ----------- | ------------------------- | ------------------------------------------------ |
| Build       | `BuildVerificationScreen` | Verify native build and sherpa-onnx version      |
| Models      | `ModelManagerScreen`      | Browse and manage on-device models               |
| Offline ASR | `OfflineASRScreen`        | Transcribe files or record-and-transcribe        |
| Stream ASR  | `StreamingASRScreen`      | Real-time streaming recognition                  |
| TTS         | `OfflineTTSScreen`        | Text-to-speech synthesis                         |
| Stream TTS  | `StreamingTTSScreen`      | Streaming TTS with chunk callbacks               |
| VAD         | `VADScreen`               | File-based and live-mic voice activity detection |
| KWS         | `KeywordSpottingScreen`   | Keyword / wake-word spotting                     |
| Speaker     | `SpeakerScreen`           | Speaker enrollment, verification, and search     |
| Diarize     | `DiarizationScreen`       | Speaker diarization with optional transcription  |
| Accel       | `AccelerationScreen`      | Hardware acceleration provider info              |

### Running the example

```bash
cd expo-sherpa-onnx/example

# iOS
npx expo run:ios

# Android
npx expo run:android
```

Place model files in the app's `Documents/models/` (iOS) or `files/models/` (Android) directory.

## Models

This module works with any sherpa-onnx compatible ONNX model. Download pre-trained models from:

- **ASR:** [sherpa-onnx ASR models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models)
- **TTS:** [sherpa-onnx TTS models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models)
- **VAD:** [silero-vad](https://github.com/snakers4/silero-vad) or sherpa-onnx VAD releases
- **Speaker:** [speaker-recognition-models](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models)
- **Diarization:** [sherpa-onnx-pyannote-segmentation-3-0](https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-segmentation-models)

## Testing

```bash
cd expo-sherpa-onnx
npx jest
```

The test suite uses mocks for native functions, enabling full coverage of the TypeScript API layer without native builds.

## License

MIT
