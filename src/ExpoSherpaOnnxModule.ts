import { requireNativeModule } from "expo";

import type {
  ModelPathConfig,
  VersionInfo,
  OfflineRecognizerResult,
  OnlineRecognizerResult,
  WaveData,
  GeneratedAudio,
  SpeechSegment,
  KeywordSpotterResult,
} from "./ExpoSherpaOnnx.types";

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
  createOfflineTts(config: Record<string, unknown>): Promise<TtsCreationResult>;
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
  vadProcessFile(handle: number, filePath: string): Promise<SpeechSegment[]>;
  destroyVad(handle: number): Promise<void>;

  // Keyword Spotting
  createKeywordSpotter(config: Record<string, unknown>): Promise<number>;
  createKeywordStream(spotterHandle: number, keywords: string): Promise<number>;
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

  // Speaker Embedding Extractor
  createSpeakerEmbeddingExtractor(
    config: Record<string, unknown>
  ): Promise<number>;
  speakerExtractorCreateStream(extractorHandle: number): Promise<number>;
  speakerStreamAcceptWaveform(
    streamHandle: number,
    samples: number[],
    sampleRate: number
  ): Promise<void>;
  speakerExtractorIsReady(
    extractorHandle: number,
    streamHandle: number
  ): Promise<boolean>;
  speakerExtractorCompute(
    extractorHandle: number,
    streamHandle: number
  ): Promise<number[]>;
  speakerExtractorDim(extractorHandle: number): Promise<number>;
  speakerExtractorComputeFromFile(
    extractorHandle: number,
    filePath: string
  ): Promise<number[]>;
  destroySpeakerStream(streamHandle: number): Promise<void>;
  destroySpeakerEmbeddingExtractor(extractorHandle: number): Promise<void>;

  // Speaker Embedding Manager
  createSpeakerEmbeddingManager(dim: number): Promise<number>;
  speakerManagerAdd(
    handle: number,
    name: string,
    embedding: number[]
  ): Promise<boolean>;
  speakerManagerAddList(
    handle: number,
    name: string,
    embeddings: number[][]
  ): Promise<boolean>;
  speakerManagerRemove(handle: number, name: string): Promise<boolean>;
  speakerManagerSearch(
    handle: number,
    embedding: number[],
    threshold: number
  ): Promise<string>;
  speakerManagerVerify(
    handle: number,
    name: string,
    embedding: number[],
    threshold: number
  ): Promise<boolean>;
  speakerManagerContains(handle: number, name: string): Promise<boolean>;
  speakerManagerNumSpeakers(handle: number): Promise<number>;
  speakerManagerAllSpeakerNames(handle: number): Promise<string[]>;
  destroySpeakerEmbeddingManager(handle: number): Promise<void>;

  // Offline Speaker Diarization
  createOfflineSpeakerDiarization(
    config: Record<string, unknown>
  ): Promise<number>;
  offlineSpeakerDiarizationGetSampleRate(handle: number): Promise<number>;
  offlineSpeakerDiarizationProcess(
    handle: number,
    samples: number[]
  ): Promise<{ start: number; end: number; speaker: number }[]>;
  offlineSpeakerDiarizationProcessFile(
    handle: number,
    filePath: string
  ): Promise<{ start: number; end: number; speaker: number }[]>;
  transcribeAndDiarizeFile(
    diarizationHandle: number,
    asrHandle: number,
    filePath: string
  ): Promise<{ speaker: number; start: number; end: number; text: string }[]>;
  offlineSpeakerDiarizationSetConfig(
    handle: number,
    config: Record<string, unknown>
  ): Promise<void>;
  destroyOfflineSpeakerDiarization(handle: number): Promise<void>;

  // Spoken Language Identification
  createSpokenLanguageIdentification(
    config: Record<string, unknown>
  ): Promise<number>;
  spokenLanguageIdentificationCompute(
    handle: number,
    samples: number[],
    sampleRate: number
  ): Promise<string>;
  spokenLanguageIdentificationComputeFromFile(
    handle: number,
    filePath: string
  ): Promise<string>;
  destroySpokenLanguageIdentification(handle: number): Promise<void>;

  // Audio Tagging
  createAudioTagging(config: Record<string, unknown>): Promise<number>;
  audioTaggingCompute(
    handle: number,
    samples: number[],
    sampleRate: number,
    topK: number
  ): Promise<{ name: string; index: number; prob: number }[]>;
  audioTaggingComputeFromFile(
    handle: number,
    filePath: string,
    topK: number
  ): Promise<{ name: string; index: number; prob: number }[]>;
  destroyAudioTagging(handle: number): Promise<void>;

  // Punctuation (Offline + Online)
  createOfflinePunctuation(config: Record<string, unknown>): Promise<number>;
  offlinePunctuationAddPunct(handle: number, text: string): Promise<string>;
  destroyOfflinePunctuation(handle: number): Promise<void>;
  createOnlinePunctuation(config: Record<string, unknown>): Promise<number>;
  onlinePunctuationAddPunct(handle: number, text: string): Promise<string>;
  destroyOnlinePunctuation(handle: number): Promise<void>;

  // Speech Denoising (Offline + Online)
  createOfflineSpeechDenoiser(config: Record<string, unknown>): Promise<number>;
  offlineSpeechDenoiserRun(
    handle: number,
    samples: number[],
    sampleRate: number
  ): Promise<{ samples: number[]; sampleRate: number }>;
  offlineSpeechDenoiserRunFromFile(
    handle: number,
    filePath: string
  ): Promise<{ samples: number[]; sampleRate: number }>;
  offlineSpeechDenoiserSaveToFile(
    handle: number,
    inputPath: string,
    outputPath: string
  ): Promise<{ outputPath: string; sampleRate: number }>;
  destroyOfflineSpeechDenoiser(handle: number): Promise<void>;
  createOnlineSpeechDenoiser(config: Record<string, unknown>): Promise<number>;
  onlineSpeechDenoiserRun(
    handle: number,
    samples: number[],
    sampleRate: number
  ): Promise<{ samples: number[]; sampleRate: number }>;
  onlineSpeechDenoiserFlush(
    handle: number
  ): Promise<{ samples: number[]; sampleRate: number }>;
  destroyOnlineSpeechDenoiser(handle: number): Promise<void>;

  // File Utilities
  saveAudioToFile(
    samples: number[],
    sampleRate: number,
    filePath: string
  ): Promise<boolean>;
  shareAudioFile(filePath: string, mimeType: string): Promise<void>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default requireNativeModule<ExpoSherpaOnnxNativeModule>(
  "ExpoSherpaOnnx"
);
