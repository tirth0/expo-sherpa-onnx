import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import ExpoSherpaOnnx, { createKeywordSpotter, listModelsAtPath, readWaveFile } from 'expo-sherpa-onnx';
import type { KeywordSpotterEngine, KeywordStream, KeywordSpotterConfig } from 'expo-sherpa-onnx';
import { styles } from '../styles';
import { useModelSubdirs } from '../hooks/useModelSubdirs';
import { base64ToFloat32 } from '../utils/audio';

export function KeywordSpottingScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const subdirs = useModelSubdirs(appPaths.modelsDir);
  const [modelDir, setModelDir] = useState('');
  const [keywords, setKeywords] = useState('');
  const [wavPath, setWavPath] = useState('');
  const [detections, setDetections] = useState<string[]>([]);
  const [fileDetections, setFileDetections] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileElapsed, setFileElapsed] = useState<number | null>(null);
  const [liveMic, setLiveMic] = useState(false);

  const spotterRef = useRef<KeywordSpotterEngine | null>(null);
  const streamRef = useRef<KeywordStream | null>(null);
  const subscriptionRef = useRef<any>(null);
  const audioBufferRef = useRef<number[]>([]);

  useEffect(() => {
    if (!modelDir && subdirs.length > 0) {
      const kwsModel = subdirs.find((d) => d.toLowerCase().includes('kws'));
      if (kwsModel) setModelDir(`${appPaths.modelsDir}/${kwsModel}`);
    }
  }, [subdirs, modelDir, appPaths.modelsDir]);

  const buildKwsConfig = useCallback(async (): Promise<KeywordSpotterConfig> => {
    const dir = modelDir.trim();
    if (!dir) throw new Error('Model directory is required');

    const allFiles = await listModelsAtPath(dir, true);
    const onnx = allFiles.filter((f) => f.endsWith('.onnx'));

    const findModel = (pattern: RegExp) => {
      const full = onnx.find((f) => pattern.test(f) && !f.includes('int8'));
      const int8 = onnx.find((f) => pattern.test(f) && f.includes('int8'));
      return full ?? int8;
    };

    const encoder = findModel(/encoder/i);
    const decoder = findModel(/decoder/i);
    const joiner = findModel(/joiner/i);
    const tokens = allFiles.find((f) => /\btokens\.txt$/i.test(f));
    const kwFile = allFiles.find((f) => /\bkeywords\.txt$/i.test(f));

    if (!encoder || !decoder || !joiner) {
      throw new Error(
        `KWS requires encoder + decoder + joiner. Found: encoder=${encoder ?? 'MISSING'}, decoder=${decoder ?? 'MISSING'}, joiner=${joiner ?? 'MISSING'}. Files: ${onnx.join(', ')}`
      );
    }
    if (!tokens) {
      throw new Error(`tokens.txt not found in ${dir}. Files: ${allFiles.join(', ')}`);
    }

    const config: KeywordSpotterConfig = {
      modelConfig: {
        transducer: {
          encoder: `${dir}/${encoder}`,
          decoder: `${dir}/${decoder}`,
          joiner: `${dir}/${joiner}`,
        },
        tokens: `${dir}/${tokens}`,
        numThreads: 2,
        provider: 'cpu',
        modelType: 'zipformer2',
      },
      maxActivePaths: 4,
      keywordsScore: 1.5,
      keywordsThreshold: 0.25,
      numTrailingBlanks: 2,
    };

    if (kwFile) {
      config.keywordsFile = `${dir}/${kwFile}`;
    }

    return config;
  }, [modelDir]);

  const handleFileKWS = useCallback(async () => {
    if (!modelDir.trim() || !wavPath.trim()) {
      Alert.alert('Missing input', 'Provide both a model directory and a WAV file path.');
      return;
    }
    setFileLoading(true);
    setFileDetections([]);
    setError(null);
    setFileElapsed(null);
    try {
      const config = await buildKwsConfig();
      const spotter = await createKeywordSpotter(config);
      const stream = await spotter.createStream(keywords);
      const wave = await readWaveFile(wavPath.trim());

      // Warmup: feed one frame_shift of silence to fix parity.
      // With snip_edges=False, frames = 1 + floor(total/160).
      // The extra +1 makes raw counts odd. This 160-sample pad shifts it even.
      await stream.acceptWaveform(new Array(160).fill(0), wave.sampleRate);

      const CHUNK = 2560;
      const t0 = Date.now();
      const found: string[] = [];

      for (let i = 0; i + CHUNK <= wave.samples.length; i += CHUNK) {
        const chunk = wave.samples.slice(i, i + CHUNK);
        await stream.acceptWaveform(chunk, wave.sampleRate);

        while (await stream.isReady()) {
          await stream.decode();
          const result = await stream.getResult();
          if (result.keyword && result.keyword.length > 0) {
            const timeSec = (i / wave.sampleRate).toFixed(2);
            found.push(`[${timeSec}s] ${result.keyword}`);
            await stream.reset();
          }
        }
      }

      setFileElapsed(Date.now() - t0);
      setFileDetections(found);
      await stream.destroy();
      await spotter.destroy();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setFileLoading(false);
    }
  }, [modelDir, wavPath, keywords, buildKwsConfig]);

  const startLiveKWS = useCallback(async () => {
    if (!modelDir.trim()) {
      Alert.alert('Missing model', 'Provide a KWS model directory first.');
      return;
    }
    setDetections([]);
    setError(null);
    setLoading(true);
    try {
      const perm = await ExpoPlayAudioStream.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission denied', 'Microphone permission is required for keyword spotting.');
        setLoading(false);
        return;
      }
      const config = await buildKwsConfig();
      const spotter = await createKeywordSpotter(config);
      spotterRef.current = spotter;

      const stream = await spotter.createStream(keywords);
      streamRef.current = stream;
      audioBufferRef.current = [];

      // Warmup: fix frame parity (snip_edges=False adds +1 frame offset)
      await stream.acceptWaveform(new Array(160).fill(0), 16000);

      const CHUNK_SIZE = 2560;
      let processing = false;

      const sub = ExpoPlayAudioStream.subscribeToAudioEvents(async (event) => {
        if (!streamRef.current || !spotterRef.current || processing) return;
        const pcmData = (event as any).data16kHz ?? (event as any).data ?? (event as any).encoded;
        if (!pcmData) return;
        const pcm = typeof pcmData === 'string' ? base64ToFloat32(pcmData) : Array.from(pcmData as Float32Array);
        audioBufferRef.current.push(...Array.from(pcm));

        if (audioBufferRef.current.length < CHUNK_SIZE) return;
        processing = true;
        try {
          while (audioBufferRef.current.length >= CHUNK_SIZE && streamRef.current) {
            const chunk = audioBufferRef.current.splice(0, CHUNK_SIZE);
            await streamRef.current.acceptWaveform(chunk, 16000);

            while (streamRef.current && await streamRef.current.isReady()) {
              await streamRef.current.decode();
              const result = await streamRef.current.getResult();
              if (result.keyword && result.keyword.length > 0) {
                const ts = new Date().toLocaleTimeString();
                setDetections((prev) => [`[${ts}] ${result.keyword}`, ...prev]);
                await streamRef.current!.reset();
              }
            }
          }
        } catch (e: any) {
          setError(e?.message ?? String(e));
        } finally {
          processing = false;
        }
      });
      subscriptionRef.current = sub;

      await ExpoPlayAudioStream.startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 200,
      });

      setLiveMic(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [modelDir, keywords, buildKwsConfig]);

  const stopLiveKWS = useCallback(async () => {
    try {
      await ExpoPlayAudioStream.stopRecording();
    } catch (_) {}
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    audioBufferRef.current = [];

    if (streamRef.current) {
      await streamRef.current.destroy();
      streamRef.current = null;
    }
    if (spotterRef.current) {
      await spotterRef.current.destroy();
      spotterRef.current = null;
    }
    setLiveMic(false);
  }, []);

  return (
    <View>
      <Text style={styles.sectionTitle}>Keyword Spotting</Text>

      {/* Model selection */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>KWS Model Directory</Text>
        {subdirs.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {subdirs.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.radio, modelDir.endsWith(d) && styles.radioActive]}
                onPress={() => setModelDir(`${appPaths.modelsDir}/${d}`)}
              >
                <Text
                  style={[styles.radioText, modelDir.endsWith(d) && styles.radioTextActive]}
                  numberOfLines={1}
                >
                  {d}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {subdirs.length === 0 && (
          <Text style={[styles.cardValue, { marginBottom: 6, color: '#888' }]}>
            No models found. Place a KWS model directory in your models folder.
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={modelDir}
          onChangeText={setModelDir}
          placeholder="Or enter model directory path manually"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Shared keywords input */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Keywords (BPE-tokenized, one per line)</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          value={keywords}
          onChangeText={setKeywords}
          placeholder={"▁HE LL O ▁WORLD\n▁A LE X A"}
          placeholderTextColor="#aaa"
          multiline
          editable={!liveMic}
        />
        <Text style={[styles.cardValue, { fontSize: 11 }]}>
          Leave empty to use keywords.txt from model directory
        </Text>
      </View>

      {/* File-based KWS */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>From File</Text>
        <TextInput
          style={styles.input}
          value={wavPath}
          onChangeText={setWavPath}
          placeholder="Path to .wav file (16kHz mono)"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.button, (fileLoading || liveMic) && { opacity: 0.5 }]}
          onPress={handleFileKWS}
          disabled={fileLoading || liveMic}
        >
          {fileLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Scan File for Keywords</Text>
          )}
        </TouchableOpacity>
        {fileElapsed !== null && (
          <Text style={styles.resultText}>Processed in {fileElapsed}ms</Text>
        )}
        {fileDetections.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.resultLabel}>{fileDetections.length} keyword(s) detected:</Text>
            {fileDetections.map((d, i) => (
              <Text key={i} style={styles.cardValue}>{d}</Text>
            ))}
          </View>
        )}
        {fileDetections.length === 0 && fileElapsed !== null && !error && (
          <Text style={styles.resultText}>No keywords detected in file.</Text>
        )}
      </View>

      {/* Live mic KWS */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Live Microphone</Text>
        {!liveMic ? (
          <TouchableOpacity
            style={[styles.button, (loading || fileLoading) && { opacity: 0.5 }]}
            onPress={startLiveKWS}
            disabled={loading || fileLoading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Start Listening</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.buttonDanger]}
            onPress={stopLiveKWS}
          >
            <Text style={styles.buttonText}>Stop Listening</Text>
          </TouchableOpacity>
        )}
      </View>

      {liveMic && (
        <View style={[styles.banner, styles.bannerPass, { marginBottom: 12 }]}>
          <Text style={styles.bannerText}>Listening for keywords...</Text>
        </View>
      )}

      {detections.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Live Detections ({detections.length})</Text>
          {detections.slice(0, 20).map((d, i) => (
            <Text key={i} style={[styles.resultText, { marginTop: i === 0 ? 0 : 4 }]}>
              {d}
            </Text>
          ))}
          {detections.length > 20 && (
            <Text style={styles.moreText}>...and {detections.length - 20} more</Text>
          )}
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}
