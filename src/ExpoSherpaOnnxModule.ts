import { requireNativeModule } from 'expo';

import type {
  ModelPathConfig,
  VersionInfo,
  OfflineRecognizerResult,
  OnlineRecognizerResult,
  WaveData,
  GeneratedAudio,
  SpeechSegment,
  KeywordSpotterResult,
} from './ExpoSherpaOnnx.types';

export type TtsCreationResult = {
  handle: number;
  sampleRate: number;
  numSpeakers: number;
};

export interface ExpoSherpaOnnxNativeModule {
  // Version info
  getVersion(): string;
  getGitSha1(): string;
  getGitDate(): string;
  getVersionInfo(): VersionInfo;

  // App paths
  getAppPaths(): { documentsDir: string; cacheDir: string; modelsDir: string };

  // Model path resolution
  resolveModelPath(config: ModelPathConfig): Promise<string>;
  listModelsAtPath(path: string, recursive: boolean): Promise<string[]>;

  // Offline ASR
  createOfflineRecognizer(config: Record<string, unknown>): Promise<number>;
  offlineRecognizerDecode(
    handle: number,
    samples: number[],
    sampleRate: number
  ): Promise<OfflineRecognizerResult>;
  offlineRecognizerDecodeFile(
    handle: number,
    filePath: string
  ): Promise<OfflineRecognizerResult>;
  destroyOfflineRecognizer(handle: number): Promise<void>;

  // Online (Streaming) ASR
  createOnlineRecognizer(config: Record<string, unknown>): Promise<number>;
  createOnlineStream(
    recognizerHandle: number,
    hotwords: string
  ): Promise<number>;
  onlineStreamAcceptWaveform(
    streamHandle: number,
    samples: number[],
    sampleRate: number
  ): Promise<void>;
  onlineStreamInputFinished(streamHandle: number): Promise<void>;
  onlineRecognizerDecode(
    recognizerHandle: number,
    streamHandle: number
  ): Promise<void>;
  onlineRecognizerIsReady(
    recognizerHandle: number,
    streamHandle: number
  ): Promise<boolean>;
  onlineRecognizerIsEndpoint(
    recognizerHandle: number,
    streamHandle: number
  ): Promise<boolean>;
  onlineRecognizerGetResult(
    recognizerHandle: number,
    streamHandle: number
  ): Promise<OnlineRecognizerResult>;
  onlineRecognizerReset(
    recognizerHandle: number,
    streamHandle: number
  ): Promise<void>;
  destroyOnlineStream(streamHandle: number): Promise<void>;
  destroyOnlineRecognizer(recognizerHandle: number): Promise<void>;

  // Wave reading
  readWaveFile(filePath: string): Promise<WaveData>;

  // Hardware acceleration
  getAvailableProviders(): string[];

  // Offline TTS
  createOfflineTts(
    config: Record<string, unknown>
  ): Promise<TtsCreationResult>;
  offlineTtsGenerate(
    handle: number,
    text: string,
    sid: number,
    speed: number
  ): Promise<GeneratedAudio>;
  offlineTtsGenerateStreaming(
    handle: number,
    text: string,
    sid: number,
    speed: number,
    requestId: string
  ): Promise<void>;
  offlineTtsSampleRate(handle: number): Promise<number>;
  offlineTtsNumSpeakers(handle: number): Promise<number>;
  destroyOfflineTts(handle: number): Promise<void>;

  // VAD
  createVad(
    config: Record<string, unknown>,
    bufferSizeInSeconds: number
  ): Promise<number>;
  vadAcceptWaveform(handle: number, samples: number[]): Promise<void>;
  vadEmpty(handle: number): Promise<boolean>;
  vadIsSpeechDetected(handle: number): Promise<boolean>;
  vadPop(handle: number): Promise<void>;
  vadFront(handle: number): Promise<SpeechSegment>;
  vadClear(handle: number): Promise<void>;
  vadReset(handle: number): Promise<void>;
  vadFlush(handle: number): Promise<void>;
  destroyVad(handle: number): Promise<void>;

  // Keyword Spotting
  createKeywordSpotter(config: Record<string, unknown>): Promise<number>;
  createKeywordStream(
    spotterHandle: number,
    keywords: string
  ): Promise<number>;
  keywordStreamAcceptWaveform(
    streamHandle: number,
    samples: number[],
    sampleRate: number
  ): Promise<void>;
  keywordSpotterIsReady(
    spotterHandle: number,
    streamHandle: number
  ): Promise<boolean>;
  keywordSpotterDecode(
    spotterHandle: number,
    streamHandle: number
  ): Promise<void>;
  keywordSpotterGetResult(
    spotterHandle: number,
    streamHandle: number
  ): Promise<KeywordSpotterResult>;
  keywordSpotterReset(
    spotterHandle: number,
    streamHandle: number
  ): Promise<void>;
  destroyKeywordStream(streamHandle: number): Promise<void>;
  destroyKeywordSpotter(spotterHandle: number): Promise<void>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default requireNativeModule<ExpoSherpaOnnxNativeModule>(
  'ExpoSherpaOnnx'
);
