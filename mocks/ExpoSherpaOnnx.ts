let handleCounter = 0;

const destroyedOfflineRecognizers = new Set<number>();
const destroyedOnlineRecognizers = new Set<number>();
const destroyedOnlineStreams = new Set<number>();
const streamToRecognizer = new Map<number, number>();

export function _resetMockState() {
  handleCounter = 0;
  destroyedOfflineRecognizers.clear();
  destroyedOnlineRecognizers.clear();
  destroyedOnlineStreams.clear();
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
  return '1.0.0';
}

export function getGitSha1(): string {
  return 'mock-sha1-abc123';
}

export function getGitDate(): string {
  return '2025-01-01';
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
    documentsDir: '/mock/Documents',
    cacheDir: '/mock/Caches',
    modelsDir: '/mock/Documents/models',
  };
}

export async function resolveModelPath(config: {
  type: string;
  path: string;
}): Promise<string> {
  if (config.type === 'file') {
    return config.path;
  }
  return `/mock/resolved/${config.path}`;
}

export async function listModelsAtPath(
  _path: string,
  _recursive: boolean
): Promise<string[]> {
  return ['model.onnx', 'tokens.txt', 'config.json'];
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
    text: 'mock transcription',
    tokens: ['mock', 'transcription'],
    timestamps: [0.0, 0.5],
    lang: 'en',
    emotion: '',
    event: '',
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
    text: 'mock file transcription',
    tokens: ['mock', 'file', 'transcription'],
    timestamps: [0.0, 0.3, 0.6],
    lang: 'en',
    emotion: '',
    event: '',
    durations: [0.3, 0.3, 0.3],
  };
}

export async function destroyOfflineRecognizer(
  handle: number
): Promise<void> {
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
    throw new Error(`Native: online recognizer ${recognizerHandle} already destroyed`);
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
    throw new Error(`Native: online recognizer ${recognizerHandle} already destroyed`);
  assertStreamAlive(streamHandle);
}

export async function onlineRecognizerIsReady(
  recognizerHandle: number,
  streamHandle: number
): Promise<boolean> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(`Native: online recognizer ${recognizerHandle} already destroyed`);
  assertStreamAlive(streamHandle);
  return true;
}

export async function onlineRecognizerIsEndpoint(
  recognizerHandle: number,
  streamHandle: number
): Promise<boolean> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(`Native: online recognizer ${recognizerHandle} already destroyed`);
  assertStreamAlive(streamHandle);
  return false;
}

export async function onlineRecognizerGetResult(
  recognizerHandle: number,
  streamHandle: number
) {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(`Native: online recognizer ${recognizerHandle} already destroyed`);
  assertStreamAlive(streamHandle);
  return {
    text: 'mock streaming result',
    tokens: ['mock', 'streaming', 'result'],
    timestamps: [0.0, 0.3, 0.6],
  };
}

export async function onlineRecognizerReset(
  recognizerHandle: number,
  streamHandle: number
): Promise<void> {
  if (destroyedOnlineRecognizers.has(recognizerHandle))
    throw new Error(`Native: online recognizer ${recognizerHandle} already destroyed`);
  assertStreamAlive(streamHandle);
}

export async function destroyOnlineStream(
  streamHandle: number
): Promise<void> {
  destroyedOnlineStreams.add(streamHandle);
}

export async function destroyOnlineRecognizer(
  recognizerHandle: number
): Promise<void> {
  destroyedOnlineRecognizers.add(recognizerHandle);
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
  return ['cpu', 'mock_provider'];
}
