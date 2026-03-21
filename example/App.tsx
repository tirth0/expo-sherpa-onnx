import { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import type {
  AudioDataEvent,
  AudioRecording,
} from '@mykin-ai/expo-audio-stream';
import ExpoSherpaOnnx, {
  assetModelPath,
  fileModelPath,
  autoModelPath,
  resolveModelPath,
  listModelsAtPath,
  detectSttModel,
  detectTtsModel,
  createSTT,
  createStreamingSTT,
  createTTS,
  readWaveFile,
  getAvailableProviders,
} from 'expo-sherpa-onnx';
import type {
  VersionInfo,
  ModelPathConfig,
  DetectedSttModel,
  DetectedTtsModel,
  OfflineRecognizerConfig,
  OnlineRecognizerConfig,
  OfflineRecognizerResult,
  OfflineTtsConfig,
} from 'expo-sherpa-onnx';
import type { OnlineSTTEngine, OnlineSTTStream, OfflineTTSEngine } from 'expo-sherpa-onnx';
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
  Clipboard,
  Platform,
} from 'react-native';

// =============================================================================
// Base64 PCM16 -> Float32 converter
// =============================================================================

function base64ToFloat32(base64: string): number[] {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32: number[] = new Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

// =============================================================================
// Audio playback helpers
// =============================================================================

const SUPPORTED_RATES = [16000, 44100, 48000] as const;

function pickPlaybackRate(sampleRate: number): number {
  if ((SUPPORTED_RATES as readonly number[]).includes(sampleRate)) return sampleRate;
  // Prefer an integer multiple (e.g. 22050 → 44100)
  for (const r of SUPPORTED_RATES) {
    if (r % sampleRate === 0 || sampleRate % r === 0) return r;
  }
  return 44100;
}

function resampleNearest(samples: number[], srcRate: number, dstRate: number): number[] {
  if (srcRate === dstRate) return samples;
  const ratio = dstRate / srcRate;
  const outLen = Math.round(samples.length * ratio);
  const out = new Array<number>(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = samples[Math.min(Math.floor(i / ratio), samples.length - 1)];
  }
  return out;
}

function float32ToPcm16Base64(samples: number[]): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const PLAY_CHUNK_SIZE = 4096;
let activeTurnId: string | null = null;

async function playTtsAudio(samples: number[], sampleRate: number): Promise<void> {
  const targetRate = pickPlaybackRate(sampleRate);
  const resampled = resampleNearest(samples, sampleRate, targetRate);
  const turnId = `tts-play-${Date.now()}`;
  activeTurnId = turnId;

  await ExpoPlayAudioStream.startBufferedAudioStream({
    turnId,
    encoding: 'pcm_s16le',
  });

  for (let offset = 0; offset < resampled.length; offset += PLAY_CHUNK_SIZE) {
    if (activeTurnId !== turnId) break;
    const chunk = resampled.slice(offset, offset + PLAY_CHUNK_SIZE);
    const pcmBase64 = float32ToPcm16Base64(chunk);
    const isFirst = offset === 0;
    const isFinal = offset + PLAY_CHUNK_SIZE >= resampled.length;
    await ExpoPlayAudioStream.playAudioBuffered(pcmBase64, turnId, isFirst, isFinal);
  }
}

async function stopTtsAudio(): Promise<void> {
  const turnId = activeTurnId;
  activeTurnId = null;
  if (turnId) {
    try { await ExpoPlayAudioStream.stopBufferedAudioStream(turnId); } catch (_) {}
  }
  try { await ExpoPlayAudioStream.stopAudio(); } catch (_) {}
}

async function startTtsStream(sampleRate: number): Promise<string> {
  const targetRate = pickPlaybackRate(sampleRate);
  const turnId = `tts-stream-${Date.now()}`;
  activeTurnId = turnId;
  await ExpoPlayAudioStream.startBufferedAudioStream({
    turnId,
    encoding: 'pcm_s16le',
  });
  return turnId;
}

async function feedTtsChunk(
  turnId: string,
  chunkSamples: number[],
  srcRate: number,
  dstRate: number,
  isFirst: boolean
): Promise<void> {
  if (activeTurnId !== turnId) return;
  const resampled = resampleNearest(chunkSamples, srcRate, dstRate);
  const pcmBase64 = float32ToPcm16Base64(resampled);
  await ExpoPlayAudioStream.playAudioBuffered(pcmBase64, turnId, isFirst, false);
}

async function finishTtsStream(turnId: string): Promise<void> {
  if (activeTurnId !== turnId) return;
  const silence = float32ToPcm16Base64([0, 0, 0, 0]);
  await ExpoPlayAudioStream.playAudioBuffered(silence, turnId, false, true);
  activeTurnId = null;
}

// =============================================================================
// Tab Navigation
// =============================================================================

type TabName = 'build' | 'models' | 'offlineASR' | 'streamingASR' | 'offlineTTS' | 'streamingTTS' | 'accel';

const TABS: { key: TabName; label: string }[] = [
  { key: 'build', label: 'Build' },
  { key: 'models', label: 'Models' },
  { key: 'offlineASR', label: 'Offline ASR' },
  { key: 'streamingASR', label: 'Stream ASR' },
  { key: 'offlineTTS', label: 'TTS' },
  { key: 'streamingTTS', label: 'Stream TTS' },
  { key: 'accel', label: 'Accel' },
];

// =============================================================================
// Build Verification
// =============================================================================

type CheckResult = {
  label: string;
  value: string;
  pass: boolean;
};

function runBuildChecks(): CheckResult[] {
  const checks: CheckResult[] = [];
  try {
    const version = ExpoSherpaOnnx.getVersion();
    checks.push({
      label: 'Version',
      value: version,
      pass: typeof version === 'string' && version.length > 0,
    });
  } catch (e: any) {
    checks.push({ label: 'Version', value: e.message, pass: false });
  }
  try {
    const sha = ExpoSherpaOnnx.getGitSha1();
    checks.push({
      label: 'Git SHA1',
      value: sha,
      pass: typeof sha === 'string' && sha.length > 0,
    });
  } catch (e: any) {
    checks.push({ label: 'Git SHA1', value: e.message, pass: false });
  }
  try {
    const date = ExpoSherpaOnnx.getGitDate();
    checks.push({
      label: 'Git Date',
      value: date,
      pass: typeof date === 'string' && date.length > 0,
    });
  } catch (e: any) {
    checks.push({ label: 'Git Date', value: e.message, pass: false });
  }
  try {
    const info: VersionInfo = ExpoSherpaOnnx.getVersionInfo();
    checks.push({
      label: 'getVersionInfo()',
      value: JSON.stringify(info),
      pass:
        typeof info === 'object' &&
        typeof info.version === 'string' &&
        typeof info.gitSha1 === 'string' &&
        typeof info.gitDate === 'string',
    });
  } catch (e: any) {
    checks.push({ label: 'getVersionInfo()', value: e.message, pass: false });
  }
  return checks;
}

function BuildVerificationScreen() {
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  useEffect(() => {
    setChecks(runBuildChecks());
  }, []);
  const allPassed = checks?.every((c) => c.pass) ?? false;

  return (
    <View>
      <Text style={styles.sectionTitle}>Build Verification</Text>
      {!checks ? (
        <ActivityIndicator size="large" style={styles.loader} />
      ) : (
        <>
          <View
            style={[
              styles.banner,
              allPassed ? styles.bannerPass : styles.bannerFail,
            ]}
          >
            <Text style={styles.bannerText}>
              {allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}
            </Text>
          </View>
          {checks.map((check, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.indicator}>
                  {check.pass ? '\u2705' : '\u274C'}
                </Text>
                <Text style={styles.cardLabel}>{check.label}</Text>
              </View>
              <Text style={styles.cardValue} selectable>
                {check.value}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// =============================================================================
// Model Manager
// =============================================================================

type PathType = 'asset' | 'file' | 'auto';

function ModelManagerScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : {
        documentsDir: '(rebuild native app to see)',
        cacheDir: '(rebuild native app to see)',
        modelsDir: '(rebuild native app to see)',
      };

  const [pathInput, setPathInput] = useState(appPaths.modelsDir);
  const [pathType, setPathType] = useState<PathType>('file');
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [listInput, setListInput] = useState(appPaths.modelsDir);
  const [recursive, setRecursive] = useState(false);
  const [fileList, setFileList] = useState<string[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const [detectInput, setDetectInput] = useState(appPaths.modelsDir);
  const [sttResult, setSttResult] = useState<DetectedSttModel | null>(null);
  const [ttsResult, setTtsResult] = useState<DetectedTtsModel | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  const handleResolve = useCallback(async () => {
    if (!pathInput.trim()) return;
    setResolving(true);
    setResolvedPath(null);
    setResolveError(null);
    try {
      const creators: Record<PathType, (p: string) => ModelPathConfig> = {
        asset: assetModelPath,
        file: fileModelPath,
        auto: autoModelPath,
      };
      const result = await resolveModelPath(creators[pathType](pathInput.trim()));
      setResolvedPath(result);
    } catch (e: any) {
      setResolveError(e.message ?? String(e));
    } finally {
      setResolving(false);
    }
  }, [pathInput, pathType]);

  const handleList = useCallback(async () => {
    if (!listInput.trim()) return;
    setListing(true);
    setFileList(null);
    setListError(null);
    try {
      setFileList(await listModelsAtPath(listInput.trim(), recursive));
    } catch (e: any) {
      setListError(e.message ?? String(e));
    } finally {
      setListing(false);
    }
  }, [listInput, recursive]);

  const handleDetectStt = useCallback(async () => {
    if (!detectInput.trim()) return;
    setDetecting(true);
    setSttResult(null);
    setTtsResult(null);
    setDetectError(null);
    try {
      setSttResult(await detectSttModel(detectInput.trim()));
    } catch (e: any) {
      setDetectError(e.message ?? String(e));
    } finally {
      setDetecting(false);
    }
  }, [detectInput]);

  const handleDetectTts = useCallback(async () => {
    if (!detectInput.trim()) return;
    setDetecting(true);
    setSttResult(null);
    setTtsResult(null);
    setDetectError(null);
    try {
      setTtsResult(await detectTtsModel(detectInput.trim()));
    } catch (e: any) {
      setDetectError(e.message ?? String(e));
    } finally {
      setDetecting(false);
    }
  }, [detectInput]);

  return (
    <View>
      <Text style={styles.sectionTitle}>Model Manager</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>App Paths</Text>
        {(
          [
            ['Models Dir', appPaths.modelsDir],
            ['Documents Dir', appPaths.documentsDir],
            ['Cache Dir', appPaths.cacheDir],
          ] as const
        ).map(([label, value]) => (
          <View key={label}>
            <Text style={styles.pathLabel}>{label}:</Text>
            <TouchableOpacity
              style={styles.copyRow}
              onPress={() => {
                Clipboard.setString(value);
                Alert.alert('Copied', 'Path copied to clipboard');
              }}
            >
              <Text style={styles.pathValue} numberOfLines={2}>{value}</Text>
              <Text style={styles.copyBtn}>Copy</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Resolve Model Path</Text>
        <TextInput style={styles.input} placeholder="Model path" value={pathInput} onChangeText={setPathInput} autoCapitalize="none" autoCorrect={false} />
        <View style={styles.radioRow}>
          {(['asset', 'file', 'auto'] as const).map((t) => (
            <TouchableOpacity key={t} style={[styles.radio, pathType === t && styles.radioActive]} onPress={() => setPathType(t)}>
              <Text style={[styles.radioText, pathType === t && styles.radioTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.button} onPress={handleResolve} disabled={resolving}>
          <Text style={styles.buttonText}>{resolving ? 'Resolving...' : 'Resolve'}</Text>
        </TouchableOpacity>
        {resolvedPath != null && <Text style={styles.resultText} selectable>{resolvedPath}</Text>}
        {resolveError != null && <Text style={styles.errorText}>{resolveError}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>List Models at Path</Text>
        <TextInput style={styles.input} placeholder="Directory path" value={listInput} onChangeText={setListInput} autoCapitalize="none" autoCorrect={false} />
        <TouchableOpacity style={styles.toggleRow} onPress={() => setRecursive(!recursive)}>
          <View style={[styles.checkbox, recursive && styles.checkboxActive]} />
          <Text style={styles.toggleLabel}>Recursive</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleList} disabled={listing}>
          <Text style={styles.buttonText}>{listing ? 'Listing...' : 'List Files'}</Text>
        </TouchableOpacity>
        {fileList != null && (
          <View style={styles.fileListContainer}>
            <Text style={styles.resultLabel}>{fileList.length} item{fileList.length !== 1 ? 's' : ''} found:</Text>
            {fileList.slice(0, 50).map((f, i) => <Text key={i} style={styles.fileItem} selectable>{f}</Text>)}
            {fileList.length > 50 && <Text style={styles.moreText}>... and {fileList.length - 50} more</Text>}
          </View>
        )}
        {listError != null && <Text style={styles.errorText}>{listError}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Detect Model Type</Text>
        <TextInput style={styles.input} placeholder="Model directory path" value={detectInput} onChangeText={setDetectInput} autoCapitalize="none" autoCorrect={false} />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.halfButton]} onPress={handleDetectStt} disabled={detecting}>
            <Text style={styles.buttonText}>Detect STT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.halfButton]} onPress={handleDetectTts} disabled={detecting}>
            <Text style={styles.buttonText}>Detect TTS</Text>
          </TouchableOpacity>
        </View>
        {detecting && <ActivityIndicator style={{ marginTop: 8 }} />}
        {sttResult != null && (
          <View style={styles.detectResult}>
            <Text style={styles.resultLabel}>STT Model Detected:</Text>
            <Text style={styles.detectType}>{sttResult.type}</Text>
            <Text style={styles.resultText} selectable>{JSON.stringify(sttResult.files, null, 2)}</Text>
          </View>
        )}
        {ttsResult != null && (
          <View style={styles.detectResult}>
            <Text style={styles.resultLabel}>TTS Model Detected:</Text>
            <Text style={styles.detectType}>{ttsResult.type}</Text>
            <Text style={styles.resultText} selectable>{JSON.stringify(ttsResult.files, null, 2)}</Text>
          </View>
        )}
        {detectError != null && <Text style={styles.errorText}>{detectError}</Text>}
      </View>
    </View>
  );
}

// =============================================================================
// Offline ASR Screen (file transcription + mic recording)
// =============================================================================

function useModelSubdirs(modelsDir: string) {
  const [subdirs, setSubdirs] = useState<string[]>([]);
  useEffect(() => {
    if (!modelsDir) return;
    listModelsAtPath(modelsDir, false)
      .then((items) => setSubdirs(items.filter((f) => !f.includes('.')).sort()))
      .catch(() => setSubdirs([]));
  }, [modelsDir]);
  return subdirs;
}

function OfflineASRScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const subdirs = useModelSubdirs(appPaths.modelsDir);
  const [modelDir, setModelDir] = useState('');
  const [wavPath, setWavPath] = useState('');
  const [result, setResult] = useState<OfflineRecognizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedSamplesRef = useRef<number[]>([]);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (!modelDir && subdirs.length > 0) {
      const offlineModel = subdirs.find((d) => !d.includes('streaming'));
      if (offlineModel) setModelDir(`${appPaths.modelsDir}/${offlineModel}`);
      else setModelDir(`${appPaths.modelsDir}/${subdirs[0]}`);
    }
  }, [subdirs, modelDir, appPaths.modelsDir]);

  const handleTranscribeFile = useCallback(async () => {
    if (!modelDir.trim() || !wavPath.trim()) {
      Alert.alert('Missing input', 'Provide both a model directory and a WAV file path.');
      return;
    }
    if (modelDir.toLowerCase().includes('streaming')) {
      Alert.alert('Wrong model', 'This looks like a streaming model. Offline ASR needs a non-streaming model (e.g. Whisper, SenseVoice, Paraformer). Streaming models only work on the "Stream ASR" tab.');
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    setElapsed(null);
    try {
      const detected = await detectSttModel(modelDir.trim());
      const config = buildOfflineConfigFromDetection(detected, modelDir.trim());
      const engine = await createSTT(config);
      const start = Date.now();
      const res = await engine.transcribeFile(wavPath.trim());
      setElapsed(Date.now() - start);
      setResult(res);
      await engine.destroy();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [modelDir, wavPath]);

  const cleanupRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
  }, []);

  const handleRecordAndTranscribe = useCallback(async () => {
    if (!modelDir.trim()) {
      Alert.alert('Missing input', 'Provide a model directory.');
      return;
    }
    if (!recording && modelDir.toLowerCase().includes('streaming')) {
      Alert.alert('Wrong model', 'This looks like a streaming model. Offline ASR needs a non-streaming model (e.g. Whisper, SenseVoice, Paraformer). Streaming models only work on the "Stream ASR" tab.');
      return;
    }
    if (recording) {
      setRecording(false);
      cleanupRecording();
      setLoading(true);
      setResult(null);
      setError(null);
      setElapsed(null);
      try {
        try { await ExpoPlayAudioStream.stopRecording(); } catch (_) { }
        const samples = [...recordedSamplesRef.current];
        recordedSamplesRef.current = [];
        if (samples.length === 0) throw new Error('No audio data recorded');

        const detected = await detectSttModel(modelDir.trim());
        const config = buildOfflineConfigFromDetection(detected, modelDir.trim());
        const engine = await createSTT(config);
        const start = Date.now();
        const res = await engine.transcribeSamples(samples, 16000);
        setElapsed(Date.now() - start);
        setResult(res);
        await engine.destroy();
      } catch (e: any) {
        setError(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    } else {
      setResult(null);
      setError(null);
      setElapsed(null);
      recordedSamplesRef.current = [];
      try {
        const perm = await ExpoPlayAudioStream.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission denied', 'Microphone permission is required.');
          return;
        }

        const sub = ExpoPlayAudioStream.subscribeToAudioEvents(async (event) => {
          const pcmData = (event as any).data16kHz ?? (event as any).data ?? (event as any).encoded;
          if (!pcmData) return;
          const samples = typeof pcmData === 'string'
            ? base64ToFloat32(pcmData)
            : Array.from(pcmData as Float32Array);
          recordedSamplesRef.current.push(...samples);
        });
        subscriptionRef.current = sub;

        try {
          await ExpoPlayAudioStream.startRecording({
            sampleRate: 16000,
            channels: 1,
            encoding: 'pcm_16bit',
            interval: 500,
          });
        } catch (startErr: any) {
          if (startErr?.message?.includes('already in progress')) {
            await ExpoPlayAudioStream.stopRecording();
            await ExpoPlayAudioStream.startRecording({
              sampleRate: 16000,
              channels: 1,
              encoding: 'pcm_16bit',
              interval: 500,
            });
          } else {
            throw startErr;
          }
        }
        setRecording(true);
        setRecordingDuration(0);
        timerRef.current = setInterval(() => {
          setRecordingDuration((d) => d + 1);
        }, 1000);
      } catch (e: any) {
        cleanupRecording();
        setError(e.message ?? String(e));
      }
    }
  }, [modelDir, recording, cleanupRecording]);

  return (
    <View>
      <Text style={styles.sectionTitle}>Offline ASR</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Model Directory</Text>
        {subdirs.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {subdirs.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.radio, modelDir.endsWith(d) && styles.radioActive]}
                onPress={() => setModelDir(`${appPaths.modelsDir}/${d}`)}
              >
                <Text style={[styles.radioText, modelDir.endsWith(d) && styles.radioTextActive]} numberOfLines={1}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TextInput style={styles.input} placeholder="Path to model directory" value={modelDir} onChangeText={setModelDir} autoCapitalize="none" autoCorrect={false} />

        <Text style={styles.cardLabel}>From File</Text>
        <TextInput style={styles.input} placeholder="Path to .wav file (16kHz mono)" value={wavPath} onChangeText={setWavPath} autoCapitalize="none" autoCorrect={false} />
        <TouchableOpacity style={styles.button} onPress={handleTranscribeFile} disabled={loading || recording}>
          <Text style={styles.buttonText}>{loading ? 'Processing...' : 'Transcribe File'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>From Microphone</Text>
        <TouchableOpacity
          style={[styles.button, recording && styles.buttonDanger]}
          onPress={handleRecordAndTranscribe}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {recording
              ? `Stop Recording (${recordingDuration}s)`
              : loading
                ? 'Transcribing...'
                : 'Record & Transcribe'}
          </Text>
        </TouchableOpacity>
        {recording && (
          <Text style={[styles.pathLabel, { textAlign: 'center', marginTop: 8 }]}>
            Recording at 16kHz mono... tap to stop and transcribe
          </Text>
        )}
      </View>

      {result != null && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Result</Text>
          {elapsed != null && <Text style={styles.pathLabel}>Decoded in {elapsed}ms</Text>}
          <Text style={styles.resultText} selectable>{result.text}</Text>
          {result.lang ? <Text style={styles.pathLabel}>Language: {result.lang}</Text> : null}
          {result.timestamps.length > 0 && (
            <Text style={styles.fileItem}>
              Timestamps: [{result.timestamps.slice(0, 10).map((t) => t.toFixed(2)).join(', ')}
              {result.timestamps.length > 10 ? '...' : ''}]
            </Text>
          )}
        </View>
      )}
      {error != null && (
        <View style={styles.card}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
    </View>
  );
}

// =============================================================================
// Streaming ASR Screen (file simulation + live mic)
// =============================================================================

function StreamingASRScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const subdirs = useModelSubdirs(appPaths.modelsDir);
  const [modelDir, setModelDir] = useState('');
  const [wavPath, setWavPath] = useState('');

  useEffect(() => {
    if (!modelDir && subdirs.length > 0) {
      const streamingModel = subdirs.find((d) => d.includes('streaming'));
      if (streamingModel) setModelDir(`${appPaths.modelsDir}/${streamingModel}`);
      else setModelDir(`${appPaths.modelsDir}/${subdirs[0]}`);
    }
  }, [subdirs, modelDir, appPaths.modelsDir]);
  const [partialResults, setPartialResults] = useState<string[]>([]);
  const [finalResult, setFinalResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [liveMic, setLiveMic] = useState(false);
  const [liveText, setLiveText] = useState('');

  const engineRef = useRef<OnlineSTTEngine | null>(null);
  const streamRef = useRef<OnlineSTTStream | null>(null);
  const subscriptionRef = useRef<any>(null);

  const handleStreamFromFile = useCallback(async () => {
    if (!modelDir.trim() || !wavPath.trim()) {
      Alert.alert('Missing input', 'Provide both a model directory and a WAV file path.');
      return;
    }
    setLoading(true);
    setPartialResults([]);
    setFinalResult(null);
    setError(null);
    setElapsed(null);
    try {
      const detected = await detectSttModel(modelDir.trim());
      const streamingTypes = ['transducer', 'nemo_transducer', 'paraformer'];
      if (!streamingTypes.includes(detected.type)) {
        setError(`Model type "${detected.type}" is offline-only and does not support streaming. Use a transducer or streaming paraformer model for live/streaming ASR.`);
        setLoading(false);
        return;
      }
      const config = buildOnlineConfigFromDetection(detected, modelDir.trim());
      const engine = await createStreamingSTT(config);
      const stream = await engine.createStream();
      const wave = await readWaveFile(wavPath.trim());

      const start = Date.now();
      const chunkSize = 3200;
      const partials: string[] = [];

      for (let i = 0; i < wave.samples.length; i += chunkSize) {
        const chunk = wave.samples.slice(i, i + chunkSize);
        await stream.acceptWaveform(chunk, wave.sampleRate);
        while (await stream.isReady()) {
          await stream.decode();
        }
        const res = await stream.getResult();
        if (res.text.trim()) {
          partials.push(res.text.trim());
          setPartialResults([...partials]);
        }
        if (await stream.isEndpoint()) {
          await stream.reset();
        }
      }

      await stream.inputFinished();
      while (await stream.isReady()) {
        await stream.decode();
      }
      const final = await stream.getResult();
      setElapsed(Date.now() - start);
      setFinalResult(final.text || partials[partials.length - 1] || '(empty)');
      await stream.destroy();
      await engine.destroy();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [modelDir, wavPath]);

  const handleLiveMicToggle = useCallback(async () => {
    if (liveMic) {
      setLiveMic(false);

      // 1. Remove audio subscription and stop recording FIRST to prevent
      //    new native calls from being dispatched while we tear down.
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      try {
        await ExpoPlayAudioStream.stopRecording();
      } catch (_) { }

      // 2. Capture refs and null them out immediately so any in-flight
      //    audio callbacks (which check streamRef.current) will bail out.
      const stream = streamRef.current;
      const engine = engineRef.current;
      streamRef.current = null;
      engineRef.current = null;

      // 3. Now safely finalize and destroy (no concurrent callers possible).
      if (stream) {
        try {
          await stream.inputFinished();
          while (await stream.isReady()) {
            await stream.decode();
          }
          const final = await stream.getResult();
          if (final.text.trim()) {
            setFinalResult(final.text.trim());
          }
          await stream.destroy();
        } catch (_) { }
      }
      if (engine) {
        try {
          await engine.destroy();
        } catch (_) { }
      }
      return;
    }

    if (!modelDir.trim()) {
      Alert.alert('Missing input', 'Provide a model directory.');
      return;
    }

    setPartialResults([]);
    setFinalResult(null);
    setError(null);
    setLiveText('');

    try {
      const perm = await ExpoPlayAudioStream.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission denied', 'Microphone permission is required.');
        return;
      }

      const detected = await detectSttModel(modelDir.trim());
      const streamingTypes = ['transducer', 'nemo_transducer', 'paraformer'];
      if (!streamingTypes.includes(detected.type)) {
        setError(`Model type "${detected.type}" is offline-only and does not support streaming. Use a transducer or streaming paraformer model for live/streaming ASR.`);
        return;
      }
      const config = buildOnlineConfigFromDetection(detected, modelDir.trim());
      const engine = await createStreamingSTT(config);
      const stream = await engine.createStream();
      engineRef.current = engine;
      streamRef.current = stream;

      const partials: string[] = [];

      const sub = ExpoPlayAudioStream.subscribeToAudioEvents(async (event) => {
        const stream = streamRef.current;
        if (!stream) return;
        try {
          const pcmData = (event as any).data16kHz ?? (event as any).data ?? (event as any).encoded;
          if (!pcmData) return;

          let samples: number[];
          if (typeof pcmData === 'string') {
            samples = base64ToFloat32(pcmData);
          } else {
            samples = Array.from(pcmData as Float32Array);
          }

          if (samples.length === 0) return;

          await stream.acceptWaveform(samples, 16000);
          if (!streamRef.current) return;
          while (await stream.isReady()) {
            if (!streamRef.current) return;
            await stream.decode();
          }
          if (!streamRef.current) return;
          const res = await stream.getResult();
          if (res.text.trim()) {
            setLiveText(res.text.trim());
            if (!streamRef.current) return;
            if (await stream.isEndpoint()) {
              partials.push(res.text.trim());
              setPartialResults([...partials]);
              await stream.reset();
              setLiveText('');
            }
          }
        } catch (e: any) {
          console.warn('Stream error:', e.message);
        }
      });
      subscriptionRef.current = sub;

      try {
        await ExpoPlayAudioStream.startRecording({
          sampleRate: 16000,
          channels: 1,
          encoding: 'pcm_16bit',
          interval: 100,
        });
      } catch (startErr: any) {
        if (startErr?.message?.includes('already in progress')) {
          await ExpoPlayAudioStream.stopRecording();
          await ExpoPlayAudioStream.startRecording({
            sampleRate: 16000,
            channels: 1,
            encoding: 'pcm_16bit',
            interval: 100,
          });
        } else {
          throw startErr;
        }
      }
      setLiveMic(true);
    } catch (e: any) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      const stream = streamRef.current;
      const engine = engineRef.current;
      streamRef.current = null;
      engineRef.current = null;
      stream?.destroy().catch(() => { });
      engine?.destroy().catch(() => { });
      setError(e.message ?? String(e));
    }
  }, [modelDir, liveMic]);

  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      const stream = streamRef.current;
      const engine = engineRef.current;
      streamRef.current = null;
      engineRef.current = null;
      stream?.destroy().catch(() => { });
      engine?.destroy().catch(() => { });
    };
  }, []);

  return (
    <View>
      <Text style={styles.sectionTitle}>Streaming ASR</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Model Directory</Text>
        {subdirs.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {subdirs.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.radio, modelDir.endsWith(d) && styles.radioActive]}
                onPress={() => setModelDir(`${appPaths.modelsDir}/${d}`)}
              >
                <Text style={[styles.radioText, modelDir.endsWith(d) && styles.radioTextActive]} numberOfLines={1}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TextInput style={styles.input} placeholder="Path to streaming model directory" value={modelDir} onChangeText={setModelDir} autoCapitalize="none" autoCorrect={false} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Live Microphone</Text>
        <TouchableOpacity
          style={[styles.button, liveMic && styles.buttonDanger]}
          onPress={handleLiveMicToggle}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {liveMic ? 'Stop Listening' : 'Start Live Mic'}
          </Text>
        </TouchableOpacity>
        {liveMic && liveText ? (
          <Text style={[styles.resultText, { backgroundColor: '#eff6ff' }]} selectable>
            {liveText}
          </Text>
        ) : null}
        {liveMic && (
          <Text style={[styles.pathLabel, { textAlign: 'center', marginTop: 4 }]}>
            Listening... speak into the microphone
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Stream from File</Text>
        <TextInput style={styles.input} placeholder="Path to .wav file (16kHz mono)" value={wavPath} onChangeText={setWavPath} autoCapitalize="none" autoCorrect={false} />
        <TouchableOpacity style={styles.button} onPress={handleStreamFromFile} disabled={loading || liveMic}>
          <Text style={styles.buttonText}>{loading ? 'Streaming...' : 'Stream from File'}</Text>
        </TouchableOpacity>
      </View>

      {partialResults.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Recognized Segments</Text>
          {partialResults.map((p, i) => (
            <Text key={i} style={styles.fileItem} selectable>[{i}] {p}</Text>
          ))}
        </View>
      )}

      {finalResult != null && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Final Result</Text>
          {elapsed != null && <Text style={styles.pathLabel}>Processed in {elapsed}ms</Text>}
          <Text style={styles.resultText} selectable>{finalResult}</Text>
        </View>
      )}

      {error != null && (
        <View style={styles.card}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {loading && <ActivityIndicator style={{ marginTop: 12 }} />}
    </View>
  );
}

// =============================================================================
// Acceleration Info Screen
// =============================================================================

function AccelerationScreen() {
  const [providers, setProviders] = useState<string[]>([]);
  useEffect(() => {
    try {
      setProviders(getAvailableProviders());
    } catch (e: any) {
      setProviders([`Error: ${e.message}`]);
    }
  }, []);

  return (
    <View>
      <Text style={styles.sectionTitle}>Hardware Acceleration</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Available Providers</Text>
        <Text style={styles.pathLabel}>
          These providers can be passed as the &quot;provider&quot; field in model configs.
        </Text>
        {providers.map((p, i) => (
          <View key={i} style={[styles.copyRow, { marginTop: 6 }]}>
            <Text style={[styles.pathValue, { flex: 1 }]}>{p}</Text>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Usage</Text>
        <Text style={[styles.resultText, { fontSize: 12 }]} selectable>
          {`createSTT({
  modelConfig: {
    provider: "${providers.includes('coreml') ? 'coreml' : providers.includes('nnapi') ? 'nnapi' : 'cpu'}",
    // ... other config
  }
})`}
        </Text>
      </View>
    </View>
  );
}

// =============================================================================
// Config builders
// =============================================================================

function buildOfflineConfigFromDetection(detected: DetectedSttModel, modelDir: string): OfflineRecognizerConfig {
  const tokensPath = detected.tokensPath ? `${modelDir}/${detected.tokensPath}` : `${modelDir}/tokens.txt`;
  const f = (key: string) => detected.files[key] ? `${modelDir}/${detected.files[key]}` : '';
  const base: OfflineRecognizerConfig = {
    modelConfig: { tokens: tokensPath, numThreads: 2, debug: false, modelType: '' },
  };
  switch (detected.type) {
    case 'whisper':
      base.modelConfig!.whisper = { encoder: f('encoder'), decoder: f('decoder') };
      break;
    case 'paraformer':
      base.modelConfig!.paraformer = { model: f('model') };
      break;
    case 'sense_voice':
      base.modelConfig!.senseVoice = { model: f('model') };
      break;
    case 'transducer':
    case 'nemo_transducer':
      base.modelConfig!.transducer = { encoder: f('encoder'), decoder: f('decoder'), joiner: f('joiner') };
      break;
    case 'nemo_ctc':
      base.modelConfig!.nemoEncDecCtc = { model: f('model') };
      break;
    case 'moonshine':
      base.modelConfig!.moonshine = { preprocessor: f('preprocessor'), encoder: f('encoder'), uncachedDecoder: f('uncachedDecoder'), cachedDecoder: f('cachedDecoder') };
      break;
  }
  return base;
}

function buildOnlineConfigFromDetection(detected: DetectedSttModel, modelDir: string): OnlineRecognizerConfig {
  const tokensPath = detected.tokensPath ? `${modelDir}/${detected.tokensPath}` : `${modelDir}/tokens.txt`;
  const f = (key: string) => detected.files[key] ? `${modelDir}/${detected.files[key]}` : '';
  const base: OnlineRecognizerConfig = {
    modelConfig: { tokens: tokensPath, numThreads: 2, debug: false, modelType: '' },
    enableEndpoint: true,
  };
  if (detected.type === 'transducer' || detected.type === 'nemo_transducer') {
    base.modelConfig!.transducer = { encoder: f('encoder'), decoder: f('decoder'), joiner: f('joiner') };
  } else if (detected.type === 'paraformer') {
    base.modelConfig!.paraformer = { encoder: f('encoder'), decoder: f('decoder') };
  }
  return base;
}

// =============================================================================
// TTS Config Builder
// =============================================================================

function buildTtsConfigFromDetection(detected: DetectedTtsModel, modelDir: string): OfflineTtsConfig {
  const tokensPath = detected.tokensPath ? `${modelDir}/${detected.tokensPath}` : `${modelDir}/tokens.txt`;
  const f = (key: string) => detected.files[key] ? `${modelDir}/${detected.files[key]}` : '';

  const base: OfflineTtsConfig = {
    model: { numThreads: 2, debug: false, provider: 'cpu' },
    maxNumSentences: 1,
  };

  switch (detected.type) {
    case 'vits':
      base.model!.vits = {
        model: f('model'),
        tokens: tokensPath,
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
      };
      break;
    case 'matcha':
      base.model!.matcha = {
        acousticModel: f('acousticModel'),
        vocoder: f('vocoder'),
        tokens: tokensPath,
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
      };
      break;
    case 'kokoro':
      base.model!.kokoro = {
        model: f('model'),
        voices: f('voices'),
        tokens: tokensPath,
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
      };
      break;
    case 'kitten':
      base.model!.kitten = {
        model: f('model'),
        voices: f('voices'),
        tokens: tokensPath,
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
      };
      break;
    case 'zipvoice':
      base.model!.zipvoice = {
        encoder: f('encoder'),
        decoder: f('decoder'),
        vocoder: f('vocoder'),
        tokens: tokensPath,
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
      };
      break;
    case 'pocket':
      base.model!.pocket = {
        lmFlow: f('lmFlow'),
        lmMain: f('lmMain'),
        encoder: f('encoder'),
        decoder: f('decoder'),
        textConditioner: f('textConditioner'),
        vocabJson: f('vocabJson'),
        tokenScoresJson: f('tokenScoresJson'),
      };
      break;
    case 'supertonic':
      base.model!.supertonic = {
        durationPredictor: f('durationPredictor'),
        textEncoder: f('textEncoder'),
        vectorEstimator: f('vectorEstimator'),
        vocoder: f('vocoder'),
        ttsJson: f('ttsJson'),
        unicodeIndexer: f('unicodeIndexer'),
        voiceStyle: f('voiceStyle'),
      };
      break;
  }
  return base;
}

// =============================================================================
// Offline TTS Screen
// =============================================================================

function OfflineTTSScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const subdirs = useModelSubdirs(appPaths.modelsDir);
  const [modelDir, setModelDir] = useState('');
  const [text, setText] = useState('Hello, this is a test of text to speech synthesis.');
  const [sid, setSid] = useState('0');
  const [speed, setSpeed] = useState('1.0');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedTtsModel | null>(null);
  const engineRef = useRef<OfflineTTSEngine | null>(null);
  const lastAudioRef = useRef<{ samples: number[]; sampleRate: number } | null>(null);

  useEffect(() => {
    if (!modelDir && subdirs.length > 0) {
      const ttsModel = subdirs.find((d) => /vits|kokoro|piper|matcha|pocket|kitten/i.test(d));
      if (ttsModel) setModelDir(`${appPaths.modelsDir}/${ttsModel}`);
    }
  }, [subdirs, modelDir, appPaths.modelsDir]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy().catch(() => { });
      stopTtsAudio();
    };
  }, []);

  const handleDetect = useCallback(async () => {
    if (!modelDir.trim()) {
      setError('Please enter a model directory');
      return;
    }
    setError(null);
    setDetected(null);
    try {
      const d = await detectTtsModel(modelDir.trim());
      setDetected(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, [modelDir]);

  const handlePlay = useCallback(async () => {
    const audio = lastAudioRef.current;
    if (!audio) return;
    try {
      setPlaying(true);
      await playTtsAudio(audio.samples, audio.sampleRate);
    } catch (e: any) {
      setError(`Playback error: ${e.message}`);
    } finally {
      setPlaying(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    await stopTtsAudio();
    setPlaying(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!modelDir.trim()) {
      setError('Please enter a model directory');
      return;
    }
    if (!text.trim()) {
      setError('Please enter text to synthesize');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    lastAudioRef.current = null;
    try {
      if (engineRef.current) {
        await engineRef.current.destroy();
        engineRef.current = null;
      }

      let det = detected;
      if (!det) {
        det = await detectTtsModel(modelDir.trim());
        setDetected(det);
      }

      const config = buildTtsConfigFromDetection(det, modelDir.trim());
      const engine = await createTTS(config);
      engineRef.current = engine;

      const startTime = Date.now();
      const audio = await engine.generate(text.trim(), parseInt(sid) || 0, parseFloat(speed) || 1.0);
      const elapsed = Date.now() - startTime;

      lastAudioRef.current = { samples: [...audio.samples], sampleRate: audio.sampleRate };

      const duration = audio.samples.length / audio.sampleRate;
      setResult(
        `Generated ${audio.samples.length} samples at ${audio.sampleRate} Hz\n` +
        `Duration: ${duration.toFixed(2)}s | Time: ${elapsed}ms\n` +
        `Speakers: ${engine.numSpeakers} | SID: ${sid}\n` +
        `Speed: ${speed}x | RTF: ${(elapsed / 1000 / duration).toFixed(3)}`
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [modelDir, text, sid, speed, detected]);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Offline TTS (Batch)</Text>

      <Text style={styles.cardLabel}>Model Directory</Text>
      {subdirs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {subdirs.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.radio, modelDir.endsWith(d) && styles.radioActive]}
              onPress={() => setModelDir(`${appPaths.modelsDir}/${d}`)}
            >
              <Text style={[styles.radioText, modelDir.endsWith(d) && styles.radioTextActive]} numberOfLines={1}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput
        style={styles.input}
        placeholder="Path to TTS model directory"
        value={modelDir}
        onChangeText={setModelDir}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={handleDetect}>
          <Text style={styles.buttonText}>Detect Model</Text>
        </TouchableOpacity>
      </View>

      {detected && (
        <View style={styles.detectResult}>
          <Text style={styles.detectType}>Type: {detected.type}</Text>
          <Text style={styles.pathLabel}>Files:</Text>
          {Object.entries(detected.files).map(([k, v]) => (
            <Text key={k} style={styles.pathValue}>{k}: {v}</Text>
          ))}
        </View>
      )}

      <Text style={[styles.cardLabel, { marginTop: 12 }]}>Text to Synthesize</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
        placeholder="Enter text..."
        value={text}
        onChangeText={setText}
        multiline
      />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>Speaker ID</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            value={sid}
            onChangeText={setSid}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>Speed</Text>
          <TextInput
            style={styles.input}
            placeholder="1.0"
            value={speed}
            onChangeText={setSpeed}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, { marginTop: 12 }, loading && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={loading || playing}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>Generate Speech</Text>
        )}
      </TouchableOpacity>

      {lastAudioRef.current && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, backgroundColor: '#059669' }, playing && { opacity: 0.6 }]}
            onPress={handlePlay}
            disabled={loading || playing}
          >
            <Text style={styles.buttonText}>{playing ? 'Playing...' : 'Play Audio'}</Text>
          </TouchableOpacity>
          {playing && (
            <TouchableOpacity
              style={[styles.button, { flex: 1 }, styles.buttonDanger]}
              onPress={handleStop}
            >
              <Text style={styles.buttonText}>Stop</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
      {result && <Text style={styles.resultText}>{result}</Text>}
    </View>
  );
}

// =============================================================================
// Streaming TTS Screen
// =============================================================================

function StreamingTTSScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const subdirs = useModelSubdirs(appPaths.modelsDir);
  const [modelDir, setModelDir] = useState('');
  const [text, setText] = useState('This is a streaming text to speech test. Each chunk of audio is delivered as it is generated, allowing playback to begin before the full synthesis is complete.');
  const [sid, setSid] = useState('0');
  const [speed, setSpeed] = useState('1.0');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [totalSamples, setTotalSamples] = useState(0);
  const [detected, setDetected] = useState<DetectedTtsModel | null>(null);
  const engineRef = useRef<OfflineTTSEngine | null>(null);
  const lastAudioRef = useRef<{ samples: number[]; sampleRate: number } | null>(null);
  const accumulatedSamplesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!modelDir && subdirs.length > 0) {
      const ttsModel = subdirs.find((d) => /vits|kokoro|piper|matcha|pocket|kitten/i.test(d));
      if (ttsModel) setModelDir(`${appPaths.modelsDir}/${ttsModel}`);
    }
  }, [subdirs, modelDir, appPaths.modelsDir]);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy().catch(() => { });
      stopTtsAudio();
    };
  }, []);

  const handleDetect = useCallback(async () => {
    if (!modelDir.trim()) {
      setError('Please enter a model directory');
      return;
    }
    setError(null);
    setDetected(null);
    try {
      const d = await detectTtsModel(modelDir.trim());
      setDetected(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, [modelDir]);

  const handlePlay = useCallback(async () => {
    const audio = lastAudioRef.current;
    if (!audio) return;
    try {
      setPlaying(true);
      await playTtsAudio(audio.samples, audio.sampleRate);
    } catch (e: any) {
      setError(`Playback error: ${e.message}`);
    } finally {
      setPlaying(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    await stopTtsAudio();
    setPlaying(false);
  }, []);

  const streamTurnRef = useRef<string | null>(null);
  const streamTargetRateRef = useRef(44100);

  const handleStreamGenerate = useCallback(async () => {
    if (!modelDir.trim()) {
      setError('Please enter a model directory');
      return;
    }
    if (!text.trim()) {
      setError('Please enter text to synthesize');
      return;
    }
    setLoading(true);
    setPlaying(true);
    setError(null);
    setResult(null);
    setChunkCount(0);
    setTotalSamples(0);
    lastAudioRef.current = null;
    accumulatedSamplesRef.current = [];

    let chunks = 0;
    let samples = 0;
    const startTime = Date.now();

    try {
      if (engineRef.current) {
        await engineRef.current.destroy();
        engineRef.current = null;
      }
      await stopTtsAudio();

      let det = detected;
      if (!det) {
        det = await detectTtsModel(modelDir.trim());
        setDetected(det);
      }

      const config = buildTtsConfigFromDetection(det, modelDir.trim());
      const engine = await createTTS(config);
      engineRef.current = engine;

      const srcRate = engine.sampleRate || 22050;
      const targetRate = pickPlaybackRate(srcRate);
      streamTargetRateRef.current = targetRate;

      const turnId = await startTtsStream(srcRate);
      streamTurnRef.current = turnId;

      await engine.generateStreaming(
        text.trim(),
        {
          onChunk: (chunkSamples) => {
            chunks++;
            samples += chunkSamples.length;
            accumulatedSamplesRef.current.push(...chunkSamples);
            setChunkCount(chunks);
            setTotalSamples(samples);

            const tid = streamTurnRef.current;
            if (tid) {
              feedTtsChunk(tid, chunkSamples, srcRate, targetRate, chunks === 1).catch(() => {});
            }
          },
          onComplete: (sampleRate) => {
            const elapsed = Date.now() - startTime;
            const duration = samples / sampleRate;
            lastAudioRef.current = { samples: [...accumulatedSamplesRef.current], sampleRate };

            const tid = streamTurnRef.current;
            if (tid) {
              finishTtsStream(tid).catch(() => {});
              streamTurnRef.current = null;
            }

            setResult(
              `Streaming complete!\n` +
              `${chunks} chunks, ${samples} total samples at ${sampleRate} Hz\n` +
              `Duration: ${duration.toFixed(2)}s | Time: ${elapsed}ms\n` +
              `RTF: ${(elapsed / 1000 / duration).toFixed(3)}`
            );
          },
          onError: (errMsg) => {
            const tid = streamTurnRef.current;
            if (tid) {
              stopTtsAudio().catch(() => {});
              streamTurnRef.current = null;
            }
            setError(`Streaming error: ${errMsg}`);
          },
        },
        parseInt(sid) || 0,
        parseFloat(speed) || 1.0
      );
    } catch (e: any) {
      setError(e.message);
      await stopTtsAudio();
      streamTurnRef.current = null;
    } finally {
      setLoading(false);
      setPlaying(false);
    }
  }, [modelDir, text, sid, speed, detected]);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Streaming TTS (Chunked)</Text>

      <Text style={styles.cardLabel}>Model Directory</Text>
      {subdirs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {subdirs.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.radio, modelDir.endsWith(d) && styles.radioActive]}
              onPress={() => setModelDir(`${appPaths.modelsDir}/${d}`)}
            >
              <Text style={[styles.radioText, modelDir.endsWith(d) && styles.radioTextActive]} numberOfLines={1}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput
        style={styles.input}
        placeholder="Path to TTS model directory"
        value={modelDir}
        onChangeText={setModelDir}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={handleDetect}>
          <Text style={styles.buttonText}>Detect Model</Text>
        </TouchableOpacity>
      </View>

      {detected && (
        <View style={styles.detectResult}>
          <Text style={styles.detectType}>Type: {detected.type}</Text>
          <Text style={styles.pathLabel}>Files:</Text>
          {Object.entries(detected.files).map(([k, v]) => (
            <Text key={k} style={styles.pathValue}>{k}: {v}</Text>
          ))}
        </View>
      )}

      <Text style={[styles.cardLabel, { marginTop: 12 }]}>Text to Synthesize</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
        placeholder="Enter text..."
        value={text}
        onChangeText={setText}
        multiline
      />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>Speaker ID</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            value={sid}
            onChangeText={setSid}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLabel}>Speed</Text>
          <TextInput
            style={styles.input}
            placeholder="1.0"
            value={speed}
            onChangeText={setSpeed}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, { marginTop: 12 }, loading && { opacity: 0.6 }]}
        onPress={handleStreamGenerate}
        disabled={loading || playing}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>Generate (Streaming)</Text>
        )}
      </TouchableOpacity>

      {loading && (
        <View style={{ marginTop: 10, backgroundColor: '#f0fdf4', padding: 10, borderRadius: 6 }}>
          <Text style={{ fontSize: 13, color: '#2d6a4f' }}>
            Chunks: {chunkCount} | Samples: {totalSamples}
          </Text>
        </View>
      )}

      {lastAudioRef.current && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.button, { flex: 1, backgroundColor: '#059669' }, playing && { opacity: 0.6 }]}
            onPress={handlePlay}
            disabled={loading || playing}
          >
            <Text style={styles.buttonText}>{playing ? 'Playing...' : 'Play Audio'}</Text>
          </TouchableOpacity>
          {playing && (
            <TouchableOpacity
              style={[styles.button, { flex: 1 }, styles.buttonDanger]}
              onPress={handleStop}
            >
              <Text style={styles.buttonText}>Stop</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
      {result && <Text style={styles.resultText}>{result}</Text>}
    </View>
  );
}

// =============================================================================
// App Root with Edge-to-Edge support
// =============================================================================

function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabName>('build');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.title}>expo-sherpa-onnx</Text>
        {activeTab === 'build' && <BuildVerificationScreen />}
        {activeTab === 'models' && <ModelManagerScreen />}
        {activeTab === 'offlineASR' && <OfflineASRScreen />}
        {activeTab === 'streamingASR' && <StreamingASRScreen />}
        {activeTab === 'offlineTTS' && <OfflineTTSScreen />}
        {activeTab === 'streamingTTS' && <StreamingTTSScreen />}
        {activeTab === 'accel' && <AccelerationScreen />}
      </ScrollView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  tabBar: {
    backgroundColor: '#1a1a2e',
    flexGrow: 0,
  },
  tabBarContent: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 4,
    gap: 2,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  scroll: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 12,
    marginTop: 8,
  },
  loader: {
    marginTop: 40,
  },
  banner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  bannerPass: {
    backgroundColor: '#d4edda',
  },
  bannerFail: {
    backgroundColor: '#f8d7da',
  },
  bannerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  indicator: {
    fontSize: 18,
    marginRight: 8,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 14,
    color: '#444',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    backgroundColor: '#fafafa',
  },
  radioRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  radio: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f9f9f9',
  },
  radioActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  radioText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  radioTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  buttonDanger: {
    backgroundColor: '#c0392b',
  },
  halfButton: {
    flex: 1,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  resultText: {
    fontSize: 13,
    color: '#2d6a4f',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginTop: 10,
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#c0392b',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginTop: 10,
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 6,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 8,
  },
  checkboxActive: {
    backgroundColor: '#1a1a2e',
    borderColor: '#1a1a2e',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#444',
  },
  fileListContainer: {
    marginTop: 10,
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 6,
  },
  fileItem: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    color: '#333',
    paddingVertical: 2,
  },
  moreText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
  },
  detectResult: {
    marginTop: 10,
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 6,
  },
  detectType: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 6,
  },
  pathLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 6,
  },
  pathValue: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    color: '#1a1a2e',
    flex: 1,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 4,
    marginTop: 2,
    gap: 8,
  },
  copyBtn: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
