let handleCounter = 0;

const destroyedOfflineRecognizers = new Set<number>();
const destroyedOnlineRecognizers = new Set<number>();
const destroyedOnlineStreams = new Set<number>();
const destroyedTtsEngines = new Set<number>();
const streamToRecognizer = new Map<number, number>();

export function _resetMockState() {
  handleCounter = 0;
  destroyedOfflineRecognizers.clear();
  destroyedOnlineRecognizers.clear();
  destroyedOnlineStreams.clear();
  destroyedTtsEngines.clear();
  streamToRecognizer.clear();
}

export function _getDestroyedOffline(): ReadonlySet<number> {
  return destroyedOfflineRecognizers;
}
export function _getDestroyedOnline(): ReadonlySet<number> {
  return destroyedOnlineRecognizers;
}
export function _getDestroyedStreams(): ReadonlySet<number> {
  return destroyedOnlineStreams;
}

export function getVersion(): string {
  return "1.0.0";
}

export function getGitSha1(): string {
  return "mock-sha1-abc123";
}

export function getGitDate(): string {
  return "2025-01-01";
}

export function getVersionInfo() {
  return {
    version: getVersion(),
    gitSha1: getGitSha1(),
    gitDate: getGitDate(),
  };
}

export function getAppPaths() {
  return {
    documentsDir: "/mock/Documents",
    cacheDir: "/mock/Caches",
    modelsDir: "/mock/Documents/models",
  };
}

export async function resolveModelPath(config: {
  type: string;
  path: string;
}): Promise<string> {
  if (config.type === "file") {
    return config.path;
  }
  return `/mock/resolved/${config.path}`;
}

export async function listModelsAtPath(
  _path: string,
  _recursive: boolean
): Promise<string[]> {
  return ["model.onnx", "tokens.txt", "config.json"];
}

// Offline ASR mocks

export async function createOfflineRecognizer(
  _config: Record<string, unknown>
): Promise<number> {
  return ++handleCounter;
}

export async function offlineRecognizerDecode(
  handle: number,
  _samples: number[],
  _sampleRate: number
) {
  if (destroyedOfflineRecognizers.has(handle))
    throw new Error(`Native: offline recognizer ${handle} already destroyed`);
  return {
    text: "mock transcription",
    tokens: ["mock", "transcription"],
    timestamps: [0.0, 0.5],
    lang: "en",
    emotion: "",
    event: "",
    durations: [0.5, 0.5],
  };
}

export async function offlineRecognizerDecodeFile(
  handle: number,
  _filePath: string
) {
  if (destroyedOfflineRecognizers.has(handle))
    throw new Error(`Native: offline recognizer ${handle} already destroyed`);
  return {
    text: "mock file transcription",
    tokens: ["mock", "file", "transcription"],
    timestamps: [0.0, 0.3, 0.6],
    lang: "en",
    emotion: "",
    event: "",
    durations: [0.3, 0.3, 0.3],
  };
}

export async function destroyOfflineRecognizer(handle: number): Promise<void> {
  destroyedOfflineRecognizers.add(handle);
}

// Online ASR mocks

export async function createOnlineRecognizer(
  _config: Record<string, unknown>
): Promise<number> {
  return ++handleCounter;
}

export async function createOnlineStream(
  recognizerHandle: number,
  _hotwords: string
): Promise<number> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(
      `Native: online recognizer ${recognizerHandle} already destroyed`
    );
  const h = ++handleCounter;
  streamToRecognizer.set(h, recognizerHandle);
  return h;
}

function assertStreamAlive(streamHandle: number) {
  if (destroyedOnlineStreams.has(streamHandle))
    throw new Error(`Native: online stream ${streamHandle} already destroyed`);
  const rec = streamToRecognizer.get(streamHandle);
  if (rec !== undefined && destroyedOnlineRecognizers.has(rec))
    throw new Error(`Native: parent recognizer ${rec} already destroyed`);
}

export async function onlineStreamAcceptWaveform(
  streamHandle: number,
  _samples: number[],
  _sampleRate: number
): Promise<void> {
  assertStreamAlive(streamHandle);
}

export async function onlineStreamInputFinished(
  streamHandle: number
): Promise<void> {
  assertStreamAlive(streamHandle);
}

export async function onlineRecognizerDecode(
  recognizerHandle: number,
  streamHandle: number
): Promise<void> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(
      `Native: online recognizer ${recognizerHandle} already destroyed`
    );
  assertStreamAlive(streamHandle);
}

export async function onlineRecognizerIsReady(
  recognizerHandle: number,
  streamHandle: number
): Promise<boolean> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(
      `Native: online recognizer ${recognizerHandle} already destroyed`
    );
  assertStreamAlive(streamHandle);
  return true;
}

export async function onlineRecognizerIsEndpoint(
  recognizerHandle: number,
  streamHandle: number
): Promise<boolean> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(
      `Native: online recognizer ${recognizerHandle} already destroyed`
    );
  assertStreamAlive(streamHandle);
  return false;
}

export async function onlineRecognizerGetResult(
  recognizerHandle: number,
  streamHandle: number
) {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(
      `Native: online recognizer ${recognizerHandle} already destroyed`
    );
  assertStreamAlive(streamHandle);
  return {
    text: "mock streaming result",
    tokens: ["mock", "streaming", "result"],
    timestamps: [0.0, 0.3, 0.6],
  };
}

export async function onlineRecognizerReset(
  recognizerHandle: number,
  streamHandle: number
): Promise<void> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(
      `Native: online recognizer ${recognizerHandle} already destroyed`
    );
  assertStreamAlive(streamHandle);
}

export async function destroyOnlineStream(streamHandle: number): Promise<void> {
  destroyedOnlineStreams.add(streamHandle);
}

export async function destroyOnlineRecognizer(
  recognizerHandle: number
): Promise<void> {
  destroyedOnlineRecognizers.add(recognizerHandle);
}

// Offline TTS mocks

export function _getDestroyedTts(): ReadonlySet<number> {
  return destroyedTtsEngines;
}

export async function createOfflineTts(
  _config: Record<string, unknown>
): Promise<{ handle: number; sampleRate: number; numSpeakers: number }> {
  const h = ++handleCounter;
  return { handle: h, sampleRate: 22050, numSpeakers: 109 };
}

export async function offlineTtsGenerate(
  handle: number,
  _text: string,
  _sid: number,
  _speed: number
) {
  if (destroyedTtsEngines.has(handle))
    throw new Error(`Native: TTS engine ${handle} already destroyed`);
  return {
    samples: [0.0, 0.1, 0.2, -0.1, 0.05, 0.0],
    sampleRate: 22050,
  };
}

export async function offlineTtsGenerateStreaming(
  handle: number,
  _text: string,
  _sid: number,
  _speed: number,
  _requestId: string
): Promise<void> {
  if (destroyedTtsEngines.has(handle))
    throw new Error(`Native: TTS engine ${handle} already destroyed`);
}

export async function destroyOfflineTts(handle: number): Promise<void> {
  destroyedTtsEngines.add(handle);
}

// Wave reading mock

export async function readWaveFile(_filePath: string) {
  return {
    samples: [0.0, 0.1, 0.2, -0.1, 0.0],
    sampleRate: 16000,
  };
}

// Hardware acceleration mock

export function getAvailableProviders(): string[] {
  return ["cpu", "mock_provider"];
}

// VAD mocks

let vadHandleCounter = 800;
const destroyedVadEngines = new Set<number>();
const vadSpeechSegments: Array<{ start: number; samples: number[] }> = [];

export async function createVad(
  _config: Record<string, unknown>,
  _bufferSizeInSeconds: number
): Promise<number> {
  return ++vadHandleCounter;
}

export async function vadAcceptWaveform(
  handle: number,
  _samples: number[]
): Promise<void> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
  vadSpeechSegments.push({ start: 0, samples: [0.1, 0.2, 0.3] });
}

export async function vadEmpty(handle: number): Promise<boolean> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
  return vadSpeechSegments.length === 0;
}

export async function vadIsSpeechDetected(handle: number): Promise<boolean> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
  return false;
}

export async function vadPop(handle: number): Promise<void> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
  vadSpeechSegments.shift();
}

export async function vadFront(
  handle: number
): Promise<{ start: number; samples: number[] }> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
  return vadSpeechSegments[0] ?? { start: 0, samples: [] };
}

export async function vadClear(handle: number): Promise<void> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
  vadSpeechSegments.length = 0;
}

export async function vadReset(handle: number): Promise<void> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
}

export async function vadFlush(handle: number): Promise<void> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
}

export async function vadProcessFile(
  handle: number,
  _filePath: string
): Promise<Array<{ start: number; samples: number[] }>> {
  if (destroyedVadEngines.has(handle))
    throw new Error(`Native: VAD ${handle} already destroyed`);
  return [
    { start: 0, samples: [0.1, 0.2, 0.3, 0.2, 0.1] },
    { start: 8000, samples: [0.05, 0.15, 0.25, 0.15, 0.05] },
  ];
}

export async function destroyVad(handle: number): Promise<void> {
  destroyedVadEngines.add(handle);
}

// KWS mocks

let kwsHandleCounter = 900;
const destroyedKwsEngines = new Set<number>();

export async function createKeywordSpotter(
  _config: Record<string, unknown>
): Promise<number> {
  return ++kwsHandleCounter;
}

export async function createKeywordStream(
  _spotterHandle: number,
  _keywords: string
): Promise<number> {
  return ++kwsHandleCounter;
}

export async function keywordStreamAcceptWaveform(
  _streamHandle: number,
  _samples: number[],
  _sampleRate: number
): Promise<void> {}

export async function keywordSpotterIsReady(
  _spotterHandle: number,
  _streamHandle: number
): Promise<boolean> {
  return false;
}

export async function keywordSpotterDecode(
  _spotterHandle: number,
  _streamHandle: number
): Promise<void> {}

export async function keywordSpotterGetResult(
  _spotterHandle: number,
  _streamHandle: number
): Promise<{ keyword: string; tokens: string[]; timestamps: number[] }> {
  return { keyword: "", tokens: [], timestamps: [] };
}

export async function keywordSpotterReset(
  _spotterHandle: number,
  _streamHandle: number
): Promise<void> {}

export async function destroyKeywordStream(
  _streamHandle: number
): Promise<void> {}

export async function destroyKeywordSpotter(
  spotterHandle: number
): Promise<void> {
  destroyedKwsEngines.add(spotterHandle);
}

// Speaker Embedding Extractor mocks

let speakerHandleCounter = 1000;
const destroyedSpeakerExtractors = new Set<number>();
const destroyedSpeakerStreams = new Set<number>();

export async function createSpeakerEmbeddingExtractor(
  _config: Record<string, unknown>
): Promise<number> {
  return ++speakerHandleCounter;
}

export async function speakerExtractorCreateStream(
  _extractorHandle: number
): Promise<number> {
  return ++speakerHandleCounter;
}

export async function speakerStreamAcceptWaveform(
  streamHandle: number,
  _samples: number[],
  _sampleRate: number
): Promise<void> {
  if (destroyedSpeakerStreams.has(streamHandle))
    throw new Error(`Native: speaker stream ${streamHandle} already destroyed`);
}

export async function speakerExtractorIsReady(
  _extractorHandle: number,
  streamHandle: number
): Promise<boolean> {
  if (destroyedSpeakerStreams.has(streamHandle))
    throw new Error(`Native: speaker stream ${streamHandle} already destroyed`);
  return true;
}

export async function speakerExtractorCompute(
  _extractorHandle: number,
  streamHandle: number
): Promise<number[]> {
  if (destroyedSpeakerStreams.has(streamHandle))
    throw new Error(`Native: speaker stream ${streamHandle} already destroyed`);
  return new Array(192).fill(0).map(() => Math.random() * 2 - 1);
}

export async function speakerExtractorDim(
  _extractorHandle: number
): Promise<number> {
  return 192;
}

export async function speakerExtractorComputeFromFile(
  extractorHandle: number,
  _filePath: string
): Promise<number[]> {
  if (destroyedSpeakerExtractors.has(extractorHandle))
    throw new Error(
      `Native: speaker extractor ${extractorHandle} already destroyed`
    );
  return new Array(192).fill(0).map(() => Math.random() * 2 - 1);
}

export async function destroySpeakerStream(
  streamHandle: number
): Promise<void> {
  destroyedSpeakerStreams.add(streamHandle);
}

export async function destroySpeakerEmbeddingExtractor(
  extractorHandle: number
): Promise<void> {
  destroyedSpeakerExtractors.add(extractorHandle);
}

// Speaker Embedding Manager mocks

let managerHandleCounter = 1100;
const destroyedManagers = new Set<number>();
const managerSpeakers = new Map<number, Map<string, number[]>>();

export async function createSpeakerEmbeddingManager(
  _dim: number
): Promise<number> {
  const h = ++managerHandleCounter;
  managerSpeakers.set(h, new Map());
  return h;
}

export async function speakerManagerAdd(
  handle: number,
  name: string,
  embedding: number[]
): Promise<boolean> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  if (!speakers) return false;
  speakers.set(name, embedding);
  return true;
}

export async function speakerManagerAddList(
  handle: number,
  name: string,
  _embeddings: number[][]
): Promise<boolean> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  if (!speakers) return false;
  speakers.set(name, []);
  return true;
}

export async function speakerManagerRemove(
  handle: number,
  name: string
): Promise<boolean> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  if (!speakers) return false;
  return speakers.delete(name);
}

export async function speakerManagerSearch(
  handle: number,
  _embedding: number[],
  _threshold: number
): Promise<string> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  if (!speakers || speakers.size === 0) return "";
  return speakers.keys().next().value ?? "";
}

export async function speakerManagerVerify(
  handle: number,
  name: string,
  _embedding: number[],
  _threshold: number
): Promise<boolean> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  if (!speakers) return false;
  return speakers.has(name);
}

export async function speakerManagerContains(
  handle: number,
  name: string
): Promise<boolean> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  if (!speakers) return false;
  return speakers.has(name);
}

export async function speakerManagerNumSpeakers(
  handle: number
): Promise<number> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  return speakers?.size ?? 0;
}

export async function speakerManagerAllSpeakerNames(
  handle: number
): Promise<string[]> {
  if (destroyedManagers.has(handle))
    throw new Error(`Native: speaker manager ${handle} already destroyed`);
  const speakers = managerSpeakers.get(handle);
  if (!speakers) return [];
  return Array.from(speakers.keys());
}

export async function destroySpeakerEmbeddingManager(
  handle: number
): Promise<void> {
  destroyedManagers.add(handle);
  managerSpeakers.delete(handle);
}

// Offline Speaker Diarization mocks

let diarizationHandleCounter = 1200;
const destroyedDiarizations = new Set<number>();

export async function createOfflineSpeakerDiarization(
  _config: Record<string, unknown>
): Promise<number> {
  return ++diarizationHandleCounter;
}

export async function offlineSpeakerDiarizationGetSampleRate(
  handle: number
): Promise<number> {
  if (destroyedDiarizations.has(handle))
    throw new Error(`Native: diarization ${handle} already destroyed`);
  return 16000;
}

export async function offlineSpeakerDiarizationProcess(
  handle: number,
  _samples: number[]
): Promise<Array<{ start: number; end: number; speaker: number }>> {
  if (destroyedDiarizations.has(handle))
    throw new Error(`Native: diarization ${handle} already destroyed`);
  return [
    { start: 0.0, end: 1.5, speaker: 0 },
    { start: 1.8, end: 3.2, speaker: 1 },
    { start: 3.5, end: 5.0, speaker: 0 },
  ];
}

export async function offlineSpeakerDiarizationProcessFile(
  handle: number,
  _filePath: string
): Promise<Array<{ start: number; end: number; speaker: number }>> {
  if (destroyedDiarizations.has(handle))
    throw new Error(`Native: diarization ${handle} already destroyed`);
  return [
    { start: 0.0, end: 1.5, speaker: 0 },
    { start: 1.8, end: 3.2, speaker: 1 },
    { start: 3.5, end: 5.0, speaker: 0 },
  ];
}

export async function transcribeAndDiarizeFile(
  diarizationHandle: number,
  asrHandle: number,
  _filePath: string
): Promise<
  Array<{ speaker: number; start: number; end: number; text: string }>
> {
  if (destroyedDiarizations.has(diarizationHandle))
    throw new Error(
      `Native: diarization ${diarizationHandle} already destroyed`
    );
  if (destroyedOfflineRecognizers.has(asrHandle))
    throw new Error(
      `Native: offline recognizer ${asrHandle} already destroyed`
    );
  return [
    { speaker: 0, start: 0.0, end: 1.5, text: "Hello from speaker zero." },
    { speaker: 1, start: 1.8, end: 3.2, text: "Hi, this is speaker one." },
    { speaker: 0, start: 3.5, end: 5.0, text: "Back to speaker zero again." },
  ];
}

export async function offlineSpeakerDiarizationSetConfig(
  handle: number,
  _config: Record<string, unknown>
): Promise<void> {
  if (destroyedDiarizations.has(handle))
    throw new Error(`Native: diarization ${handle} already destroyed`);
}

export async function destroyOfflineSpeakerDiarization(
  handle: number
): Promise<void> {
  destroyedDiarizations.add(handle);
}

// Spoken Language Identification mocks

let slidHandleCounter = 1300;
const destroyedSlids = new Set<number>();

export async function createSpokenLanguageIdentification(
  _config: Record<string, unknown>
): Promise<number> {
  return ++slidHandleCounter;
}

export async function spokenLanguageIdentificationCompute(
  handle: number,
  _samples: number[],
  _sampleRate: number
): Promise<string> {
  if (destroyedSlids.has(handle))
    throw new Error(`Native: SLID ${handle} already destroyed`);
  return "en";
}

export async function spokenLanguageIdentificationComputeFromFile(
  handle: number,
  _filePath: string
): Promise<string> {
  if (destroyedSlids.has(handle))
    throw new Error(`Native: SLID ${handle} already destroyed`);
  return "en";
}

export async function destroySpokenLanguageIdentification(
  handle: number
): Promise<void> {
  destroyedSlids.add(handle);
}

// Audio Tagging mocks

let audioTaggingHandleCounter = 1400;
const destroyedAudioTaggings = new Set<number>();

export async function createAudioTagging(
  _config: Record<string, unknown>
): Promise<number> {
  return ++audioTaggingHandleCounter;
}

export async function audioTaggingCompute(
  handle: number,
  _samples: number[],
  _sampleRate: number,
  _topK: number
): Promise<Array<{ name: string; index: number; prob: number }>> {
  if (destroyedAudioTaggings.has(handle))
    throw new Error(`Native: AudioTagging ${handle} already destroyed`);
  return [
    { name: "Speech", index: 0, prob: 0.95 },
    { name: "Music", index: 1, prob: 0.03 },
    { name: "Silence", index: 2, prob: 0.02 },
  ];
}

export async function audioTaggingComputeFromFile(
  handle: number,
  _filePath: string,
  _topK: number
): Promise<Array<{ name: string; index: number; prob: number }>> {
  if (destroyedAudioTaggings.has(handle))
    throw new Error(`Native: AudioTagging ${handle} already destroyed`);
  return [
    { name: "Speech", index: 0, prob: 0.92 },
    { name: "Music", index: 1, prob: 0.05 },
  ];
}

export async function destroyAudioTagging(handle: number): Promise<void> {
  destroyedAudioTaggings.add(handle);
}

// Punctuation mocks (Offline + Online)

let offlinePunctHandleCounter = 1500;
const destroyedOfflinePuncts = new Set<number>();
let onlinePunctHandleCounter = 1600;
const destroyedOnlinePuncts = new Set<number>();

export async function createOfflinePunctuation(
  _config: Record<string, unknown>
): Promise<number> {
  return ++offlinePunctHandleCounter;
}

export async function offlinePunctuationAddPunct(
  handle: number,
  text: string
): Promise<string> {
  if (destroyedOfflinePuncts.has(handle))
    throw new Error(`Native: OfflinePunctuation ${handle} already destroyed`);
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

export async function destroyOfflinePunctuation(handle: number): Promise<void> {
  destroyedOfflinePuncts.add(handle);
}

export async function createOnlinePunctuation(
  _config: Record<string, unknown>
): Promise<number> {
  return ++onlinePunctHandleCounter;
}

export async function onlinePunctuationAddPunct(
  handle: number,
  text: string
): Promise<string> {
  if (destroyedOnlinePuncts.has(handle))
    throw new Error(`Native: OnlinePunctuation ${handle} already destroyed`);
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

export async function destroyOnlinePunctuation(handle: number): Promise<void> {
  destroyedOnlinePuncts.add(handle);
}

// Speech Denoising mocks (Offline + Online)

let offlineDenoiserHandleCounter = 1700;
const destroyedOfflineDenoiserEngines = new Set<number>();
let onlineDenoiserHandleCounter = 1800;
const destroyedOnlineDenoiserEngines = new Set<number>();

export async function createOfflineSpeechDenoiser(
  _config: Record<string, unknown>
): Promise<number> {
  return ++offlineDenoiserHandleCounter;
}

export async function offlineSpeechDenoiserRun(
  handle: number,
  samples: number[],
  _sampleRate: number
): Promise<{ samples: number[]; sampleRate: number }> {
  if (destroyedOfflineDenoiserEngines.has(handle))
    throw new Error(
      `Native: OfflineSpeechDenoiser ${handle} already destroyed`
    );
  return { samples: samples.map((s) => s * 0.9), sampleRate: 16000 };
}

export async function offlineSpeechDenoiserRunFromFile(
  handle: number,
  _filePath: string
): Promise<{ samples: number[]; sampleRate: number }> {
  if (destroyedOfflineDenoiserEngines.has(handle))
    throw new Error(
      `Native: OfflineSpeechDenoiser ${handle} already destroyed`
    );
  return { samples: [0.05, 0.1, 0.15, 0.1, 0.05], sampleRate: 16000 };
}

export async function offlineSpeechDenoiserSaveToFile(
  handle: number,
  _inputPath: string,
  outputPath: string
): Promise<{ outputPath: string; sampleRate: number }> {
  if (destroyedOfflineDenoiserEngines.has(handle))
    throw new Error(
      `Native: OfflineSpeechDenoiser ${handle} already destroyed`
    );
  return { outputPath, sampleRate: 16000 };
}

export async function destroyOfflineSpeechDenoiser(
  handle: number
): Promise<void> {
  destroyedOfflineDenoiserEngines.add(handle);
}

export async function createOnlineSpeechDenoiser(
  _config: Record<string, unknown>
): Promise<number> {
  return ++onlineDenoiserHandleCounter;
}

export async function onlineSpeechDenoiserRun(
  handle: number,
  samples: number[],
  _sampleRate: number
): Promise<{ samples: number[]; sampleRate: number }> {
  if (destroyedOnlineDenoiserEngines.has(handle))
    throw new Error(`Native: OnlineSpeechDenoiser ${handle} already destroyed`);
  return { samples: samples.map((s) => s * 0.9), sampleRate: 16000 };
}

export async function onlineSpeechDenoiserFlush(
  handle: number
): Promise<{ samples: number[]; sampleRate: number }> {
  if (destroyedOnlineDenoiserEngines.has(handle))
    throw new Error(`Native: OnlineSpeechDenoiser ${handle} already destroyed`);
  return { samples: [0.01, 0.02], sampleRate: 16000 };
}

export async function destroyOnlineSpeechDenoiser(
  handle: number
): Promise<void> {
  destroyedOnlineDenoiserEngines.add(handle);
}

// File Utilities mocks

export async function saveAudioToFile(
  _samples: number[],
  _sampleRate: number,
  _filePath: string
): Promise<boolean> {
  return true;
}

export async function shareAudioFile(
  _filePath: string,
  _mimeType: string
): Promise<void> {}
