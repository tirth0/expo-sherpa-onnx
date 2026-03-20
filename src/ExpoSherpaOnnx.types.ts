// =============================================================================
// Core / Shared
// =============================================================================

export type VersionInfo = {
  version: string;
  gitSha1: string;
  gitDate: string;
};

export type ModelPathConfig = {
  type: 'asset' | 'file' | 'auto';
  path: string;
};

export type FeatureConfig = {
  sampleRate?: number;
  featureDim?: number;
  dither?: number;
};

export type QnnConfig = {
  backendLib?: string;
  contextBinary?: string;
  systemLib?: string;
};

export type HomophoneReplacerConfig = {
  dictDir?: string;
  lexicon?: string;
  ruleFsts?: string;
};

// =============================================================================
// Online (Streaming) ASR
// =============================================================================

export type EndpointRule = {
  mustContainNonSilence: boolean;
  minTrailingSilence: number;
  minUtteranceLength: number;
};

export type EndpointConfig = {
  rule1?: EndpointRule;
  rule2?: EndpointRule;
  rule3?: EndpointRule;
};

export type OnlineTransducerModelConfig = {
  encoder?: string;
  decoder?: string;
  joiner?: string;
};

export type OnlineParaformerModelConfig = {
  encoder?: string;
  decoder?: string;
};

export type OnlineZipformer2CtcModelConfig = {
  model?: string;
};

export type OnlineNeMoCtcModelConfig = {
  model?: string;
};

export type OnlineToneCtcModelConfig = {
  model?: string;
};

export type OnlineModelConfig = {
  transducer?: OnlineTransducerModelConfig;
  paraformer?: OnlineParaformerModelConfig;
  zipformer2Ctc?: OnlineZipformer2CtcModelConfig;
  neMoCtc?: OnlineNeMoCtcModelConfig;
  toneCtc?: OnlineToneCtcModelConfig;
  tokens?: string;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
  modelType?: string;
  modelingUnit?: string;
  bpeVocab?: string;
};

export type OnlineLMConfig = {
  model?: string;
  scale?: number;
};

export type OnlineCtcFstDecoderConfig = {
  graph?: string;
  maxActive?: number;
};

export type OnlineRecognizerConfig = {
  featConfig?: FeatureConfig;
  modelConfig?: OnlineModelConfig;
  lmConfig?: OnlineLMConfig;
  ctcFstDecoderConfig?: OnlineCtcFstDecoderConfig;
  hr?: HomophoneReplacerConfig;
  endpointConfig?: EndpointConfig;
  enableEndpoint?: boolean;
  decodingMethod?: string;
  maxActivePaths?: number;
  hotwordsFile?: string;
  hotwordsScore?: number;
  ruleFsts?: string;
  ruleFars?: string;
  blankPenalty?: number;
};

export type OnlineRecognizerResult = {
  text: string;
  tokens: string[];
  timestamps: number[];
  ysProbs: number[];
};

// =============================================================================
// Offline (Batch) ASR
// =============================================================================

export type OfflineTransducerModelConfig = {
  encoder?: string;
  decoder?: string;
  joiner?: string;
};

export type OfflineParaformerModelConfig = {
  model?: string;
  qnnConfig?: QnnConfig;
};

export type OfflineNemoEncDecCtcModelConfig = {
  model?: string;
};

export type OfflineDolphinModelConfig = {
  model?: string;
};

export type OfflineZipformerCtcModelConfig = {
  model?: string;
  qnnConfig?: QnnConfig;
};

export type OfflineWenetCtcModelConfig = {
  model?: string;
};

export type OfflineOmnilingualAsrCtcModelConfig = {
  model?: string;
};

export type OfflineMedAsrCtcModelConfig = {
  model?: string;
};

export type OfflineFireRedAsrCtcModelConfig = {
  model?: string;
};

export type OfflineFunAsrNanoModelConfig = {
  encoderAdaptor?: string;
  llm?: string;
  embedding?: string;
  tokenizer?: string;
  systemPrompt?: string;
  userPrompt?: string;
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
  seed?: number;
  language?: string;
  itn?: number;
  hotwords?: string;
};

export type OfflineWhisperModelConfig = {
  encoder?: string;
  decoder?: string;
  language?: string;
  task?: string;
  tailPaddings?: number;
  enableTokenTimestamps?: boolean;
  enableSegmentTimestamps?: boolean;
};

export type OfflineCanaryModelConfig = {
  encoder?: string;
  decoder?: string;
  srcLang?: string;
  tgtLang?: string;
  usePnc?: boolean;
};

export type OfflineFireRedAsrModelConfig = {
  encoder?: string;
  decoder?: string;
};

export type OfflineMoonshineModelConfig = {
  preprocessor?: string;
  encoder?: string;
  uncachedDecoder?: string;
  cachedDecoder?: string;
  mergedDecoder?: string;
};

export type OfflineSenseVoiceModelConfig = {
  model?: string;
  language?: string;
  useInverseTextNormalization?: boolean;
  qnnConfig?: QnnConfig;
};

export type OfflineModelConfig = {
  transducer?: OfflineTransducerModelConfig;
  paraformer?: OfflineParaformerModelConfig;
  nemoEncDecCtc?: OfflineNemoEncDecCtcModelConfig;
  dolphin?: OfflineDolphinModelConfig;
  zipformerCtc?: OfflineZipformerCtcModelConfig;
  wenetCtc?: OfflineWenetCtcModelConfig;
  omnilingualAsrCtc?: OfflineOmnilingualAsrCtcModelConfig;
  medAsrCtc?: OfflineMedAsrCtcModelConfig;
  fireRedAsrCtc?: OfflineFireRedAsrCtcModelConfig;
  funAsrNano?: OfflineFunAsrNanoModelConfig;
  whisper?: OfflineWhisperModelConfig;
  canary?: OfflineCanaryModelConfig;
  fireRedAsr?: OfflineFireRedAsrModelConfig;
  moonshine?: OfflineMoonshineModelConfig;
  senseVoice?: OfflineSenseVoiceModelConfig;
  teleSpeech?: string;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
  modelType?: string;
  tokens?: string;
  modelingUnit?: string;
  bpeVocab?: string;
};

export type OfflineRecognizerConfig = {
  featConfig?: FeatureConfig;
  modelConfig?: OfflineModelConfig;
  hr?: HomophoneReplacerConfig;
  decodingMethod?: string;
  maxActivePaths?: number;
  hotwordsFile?: string;
  hotwordsScore?: number;
  ruleFsts?: string;
  ruleFars?: string;
  blankPenalty?: number;
};

export type OfflineRecognizerResult = {
  text: string;
  tokens: string[];
  timestamps: number[];
  lang: string;
  emotion: string;
  event: string;
  durations: number[];
};

// =============================================================================
// Text-to-Speech (TTS)
// =============================================================================

export type OfflineTtsVitsModelConfig = {
  model?: string;
  lexicon?: string;
  tokens?: string;
  dataDir?: string;
  dictDir?: string;
  noiseScale?: number;
  noiseScaleW?: number;
  lengthScale?: number;
};

export type OfflineTtsMatchaModelConfig = {
  acousticModel?: string;
  vocoder?: string;
  lexicon?: string;
  tokens?: string;
  dataDir?: string;
  dictDir?: string;
  noiseScale?: number;
  lengthScale?: number;
};

export type OfflineTtsKokoroModelConfig = {
  model?: string;
  voices?: string;
  tokens?: string;
  dataDir?: string;
  lexicon?: string;
  lang?: string;
  dictDir?: string;
  lengthScale?: number;
};

export type OfflineTtsZipVoiceModelConfig = {
  tokens?: string;
  encoder?: string;
  decoder?: string;
  vocoder?: string;
  dataDir?: string;
  lexicon?: string;
  featScale?: number;
  tShift?: number;
  targetRms?: number;
  guidanceScale?: number;
};

export type OfflineTtsKittenModelConfig = {
  model?: string;
  voices?: string;
  tokens?: string;
  dataDir?: string;
  lengthScale?: number;
};

export type OfflineTtsPocketModelConfig = {
  lmFlow?: string;
  lmMain?: string;
  encoder?: string;
  decoder?: string;
  textConditioner?: string;
  vocabJson?: string;
  tokenScoresJson?: string;
  voiceEmbeddingCacheCapacity?: number;
};

export type OfflineTtsSupertonicModelConfig = {
  durationPredictor?: string;
  textEncoder?: string;
  vectorEstimator?: string;
  vocoder?: string;
  ttsJson?: string;
  unicodeIndexer?: string;
  voiceStyle?: string;
};

export type OfflineTtsModelConfig = {
  vits?: OfflineTtsVitsModelConfig;
  matcha?: OfflineTtsMatchaModelConfig;
  kokoro?: OfflineTtsKokoroModelConfig;
  zipvoice?: OfflineTtsZipVoiceModelConfig;
  kitten?: OfflineTtsKittenModelConfig;
  pocket?: OfflineTtsPocketModelConfig;
  supertonic?: OfflineTtsSupertonicModelConfig;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

export type OfflineTtsConfig = {
  model?: OfflineTtsModelConfig;
  ruleFsts?: string;
  ruleFars?: string;
  maxNumSentences?: number;
  silenceScale?: number;
};

export type GenerationConfig = {
  silenceScale?: number;
  speed?: number;
  sid?: number;
  referenceAudio?: number[];
  referenceSampleRate?: number;
  referenceText?: string;
  numSteps?: number;
  extra?: Record<string, unknown>;
};

export type GeneratedAudio = {
  samples: number[];
  sampleRate: number;
};

// =============================================================================
// Voice Activity Detection (VAD)
// =============================================================================

export type SileroVadModelConfig = {
  model?: string;
  threshold?: number;
  minSilenceDuration?: number;
  minSpeechDuration?: number;
  windowSize?: number;
  maxSpeechDuration?: number;
};

export type TenVadModelConfig = {
  model?: string;
  threshold?: number;
  minSilenceDuration?: number;
  minSpeechDuration?: number;
  windowSize?: number;
  maxSpeechDuration?: number;
};

export type VadModelConfig = {
  sileroVadModelConfig?: SileroVadModelConfig;
  tenVadModelConfig?: TenVadModelConfig;
  sampleRate?: number;
  numThreads?: number;
  provider?: string;
  debug?: boolean;
};

export type SpeechSegment = {
  start: number;
  samples: number[];
};

// =============================================================================
// Keyword Spotting
// =============================================================================

export type KeywordSpotterConfig = {
  featConfig?: FeatureConfig;
  modelConfig?: OnlineModelConfig;
  maxActivePaths?: number;
  keywordsFile?: string;
  keywordsScore?: number;
  keywordsThreshold?: number;
  numTrailingBlanks?: number;
};

export type KeywordSpotterResult = {
  keyword: string;
  tokens: string[];
  timestamps: number[];
};

// =============================================================================
// Speaker Embedding & Identification
// =============================================================================

export type SpeakerEmbeddingExtractorConfig = {
  model?: string;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

// =============================================================================
// Speaker Diarization
// =============================================================================

export type OfflineSpeakerSegmentationPyannoteModelConfig = {
  model?: string;
};

export type OfflineSpeakerSegmentationModelConfig = {
  pyannote?: OfflineSpeakerSegmentationPyannoteModelConfig;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

export type FastClusteringConfig = {
  numClusters?: number;
  threshold?: number;
};

export type OfflineSpeakerDiarizationConfig = {
  segmentation?: OfflineSpeakerSegmentationModelConfig;
  embedding?: SpeakerEmbeddingExtractorConfig;
  clustering?: FastClusteringConfig;
  minDurationOn?: number;
  minDurationOff?: number;
};

export type DiarizationSegment = {
  start: number;
  end: number;
  speaker: number;
};

// =============================================================================
// Spoken Language Identification
// =============================================================================

export type SpokenLanguageIdentificationWhisperConfig = {
  encoder?: string;
  decoder?: string;
  tailPaddings?: number;
};

export type SpokenLanguageIdentificationConfig = {
  whisper?: SpokenLanguageIdentificationWhisperConfig;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

// =============================================================================
// Audio Tagging
// =============================================================================

export type OfflineZipformerAudioTaggingModelConfig = {
  model?: string;
};

export type AudioTaggingModelConfig = {
  zipformer?: OfflineZipformerAudioTaggingModelConfig;
  ced?: string;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

export type AudioTaggingConfig = {
  model?: AudioTaggingModelConfig;
  labels?: string;
  topK?: number;
};

export type AudioEvent = {
  name: string;
  index: number;
  prob: number;
};

// =============================================================================
// Punctuation
// =============================================================================

export type OnlinePunctuationModelConfig = {
  cnnBilstm?: string;
  bpeVocab?: string;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

export type OnlinePunctuationConfig = {
  model?: OnlinePunctuationModelConfig;
};

export type OfflinePunctuationModelConfig = {
  ctTransformer?: string;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

export type OfflinePunctuationConfig = {
  model?: OfflinePunctuationModelConfig;
};

// =============================================================================
// Speech Denoising
// =============================================================================

export type OfflineSpeechDenoiserGtcrnModelConfig = {
  model?: string;
};

export type OfflineSpeechDenoiserDpdfNetModelConfig = {
  model?: string;
};

export type OfflineSpeechDenoiserModelConfig = {
  gtcrn?: OfflineSpeechDenoiserGtcrnModelConfig;
  dpdfnet?: OfflineSpeechDenoiserDpdfNetModelConfig;
  numThreads?: number;
  debug?: boolean;
  provider?: string;
};

export type OfflineSpeechDenoiserConfig = {
  model?: OfflineSpeechDenoiserModelConfig;
};

export type OnlineSpeechDenoiserConfig = {
  model?: OfflineSpeechDenoiserModelConfig;
};

export type DenoisedAudio = {
  samples: number[];
  sampleRate: number;
};

// =============================================================================
// Model Detection
// =============================================================================

export type SttModelType =
  | 'transducer'
  | 'paraformer'
  | 'whisper'
  | 'sense_voice'
  | 'nemo_ctc'
  | 'wenet_ctc'
  | 'zipformer_ctc'
  | 'moonshine'
  | 'funasr_nano'
  | 'fire_red_asr'
  | 'dolphin'
  | 'canary'
  | 'omnilingual'
  | 'medasr'
  | 'telespeech_ctc'
  | 'nemo_transducer'
  | 'tone_ctc'
  | 'auto';

export type TtsModelType =
  | 'vits'
  | 'matcha'
  | 'kokoro'
  | 'kitten'
  | 'pocket'
  | 'zipvoice'
  | 'supertonic'
  | 'auto';

export type DetectedSttModel = {
  type: SttModelType;
  files: Record<string, string>;
  tokensPath?: string;
};

export type DetectedTtsModel = {
  type: TtsModelType;
  files: Record<string, string>;
  tokensPath?: string;
};

// =============================================================================
// Wave / Audio Utilities
// =============================================================================

export type WaveData = {
  samples: number[];
  sampleRate: number;
};
