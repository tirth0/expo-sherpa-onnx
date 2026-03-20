import { requireNativeModule } from 'expo';

import type {
  ModelPathConfig,
  VersionInfo,
  OfflineRecognizerResult,
  OnlineRecognizerResult,
  WaveData,
} from './ExpoSherpaOnnx.types';

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
}

export default requireNativeModule<ExpoSherpaOnnxNativeModule>(
  'ExpoSherpaOnnx'
);
