import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import ExpoSherpaOnnx, { createVAD, readWaveFile, listModelsAtPath } from 'expo-sherpa-onnx';
import type { VADEngine, VadModelConfig } from 'expo-sherpa-onnx';
import { styles } from '../styles';
import { base64ToFloat32 } from '../utils/audio';

type Segment = { start: number; durationSamples: number };

function useVadModelFiles(modelsDir: string) {
  const [models, setModels] = useState<{ name: string; path: string }[]>([]);
  useEffect(() => {
    if (!modelsDir) return;
    listModelsAtPath(modelsDir, true)
      .then((items) => {
        const vadFiles = items.filter(
          (f) =>
            f.endsWith('.onnx') &&
            (f.toLowerCase().includes('silero_vad') ||
              f.toLowerCase().includes('silero-vad') ||
              f.toLowerCase().includes('ten-vad') ||
              f.toLowerCase().includes('ten_vad'))
        );
        setModels(
          vadFiles.map((f) => ({
            name: f.split('/').pop() ?? f,
            path: `${modelsDir}/${f}`,
          }))
        );
      })
      .catch(() => setModels([]));
  }, [modelsDir]);
  return models;
}

export function VADScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const vadModels = useVadModelFiles(appPaths.modelsDir);
  const [vadModelPath, setVadModelPath] = useState('');
  const [wavPath, setWavPath] = useState('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const [liveMic, setLiveMic] = useState(false);
  const [liveSegments, setLiveSegments] = useState<Segment[]>([]);
  const [speechDetected, setSpeechDetected] = useState(false);

  const vadRef = useRef<VADEngine | null>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (!vadModelPath && vadModels.length > 0) {
      setVadModelPath(vadModels[0].path);
    }
  }, [vadModels, vadModelPath]);

  const handleFileVAD = useCallback(async () => {
    if (!vadModelPath.trim() || !wavPath.trim()) {
      Alert.alert('Missing input', 'Provide both a VAD model path and a WAV file path.');
      return;
    }
    setLoading(true);
    setSegments([]);
    setError(null);
    setElapsed(null);
    try {
      const config = buildVadConfig(vadModelPath);
      const vad = await createVAD(config, 60.0);
      const wave = await readWaveFile(wavPath);
      const windowSize = config.sileroVadModelConfig?.windowSize ?? 512;
      const t0 = Date.now();

      for (let i = 0; i < wave.samples.length; i += windowSize) {
        const chunk = wave.samples.slice(i, i + windowSize);
        if (chunk.length === windowSize) {
          await vad.acceptWaveform(chunk);
        }
      }
      await vad.flush();

      const detectedSegments: Segment[] = [];
      while (!(await vad.empty())) {
        const seg = await vad.front();
        detectedSegments.push({ start: seg.start, durationSamples: seg.samples.length });
        await vad.pop();
      }

      setElapsed(Date.now() - t0);
      setSegments(detectedSegments);
      await vad.destroy();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [vadModelPath, wavPath]);

  const startLiveVAD = useCallback(async () => {
    if (!vadModelPath.trim()) {
      Alert.alert('Missing model', 'Provide a VAD model path first.');
      return;
    }
    setLiveSegments([]);
    setSpeechDetected(false);
    setError(null);
    try {
      const perm = await ExpoPlayAudioStream.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission denied', 'Microphone permission is required for live VAD.');
        return;
      }
      const config = buildVadConfig(vadModelPath);
      const vad = await createVAD(config, 30.0);
      vadRef.current = vad;

      const sub = ExpoPlayAudioStream.subscribeToAudioEvents(async (event) => {
        if (!vadRef.current) return;
        const pcmData = (event as any).data16kHz ?? (event as any).data ?? (event as any).encoded;
        if (!pcmData) return;
        const pcm = typeof pcmData === 'string' ? base64ToFloat32(pcmData) : Array.from(pcmData as Float32Array);
        const windowSize = config.sileroVadModelConfig?.windowSize ?? config.tenVadModelConfig?.windowSize ?? 512;

        for (let i = 0; i < pcm.length; i += windowSize) {
          const chunk = Array.from(pcm.slice(i, i + windowSize));
          if (chunk.length === windowSize) {
            await vadRef.current.acceptWaveform(chunk);
          }
        }

        const detected = await vadRef.current.isSpeechDetected();
        setSpeechDetected(detected);

        while (!(await vadRef.current.empty())) {
          const seg = await vadRef.current.front();
          setLiveSegments((prev) => [...prev, { start: seg.start, durationSamples: seg.samples.length }]);
          await vadRef.current.pop();
        }
      });
      subscriptionRef.current = sub;

      await ExpoPlayAudioStream.startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
      });

      setLiveMic(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [vadModelPath]);

  const stopLiveVAD = useCallback(async () => {
    try {
      await ExpoPlayAudioStream.stopRecording();
    } catch (_) {}
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;

    if (vadRef.current) {
      try {
        await vadRef.current.flush();
        while (!(await vadRef.current.empty())) {
          const seg = await vadRef.current.front();
          setLiveSegments((prev) => [...prev, { start: seg.start, durationSamples: seg.samples.length }]);
          await vadRef.current.pop();
        }
      } catch (_) {}
      await vadRef.current.destroy();
      vadRef.current = null;
    }
    setLiveMic(false);
    setSpeechDetected(false);
  }, []);

  return (
    <View>
      <Text style={styles.sectionTitle}>Voice Activity Detection</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>VAD Model</Text>
        {vadModels.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {vadModels.map((m) => (
              <TouchableOpacity
                key={m.path}
                style={[styles.radio, vadModelPath === m.path && styles.radioActive]}
                onPress={() => setVadModelPath(m.path)}
              >
                <Text
                  style={[styles.radioText, vadModelPath === m.path && styles.radioTextActive]}
                  numberOfLines={1}
                >
                  {m.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {vadModels.length === 0 && (
          <Text style={[styles.cardValue, { marginBottom: 6, color: '#888' }]}>
            No VAD models found. Place silero_vad.onnx or ten-vad.onnx in your models directory.
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={vadModelPath}
          onChangeText={setVadModelPath}
          placeholder="Or enter model path manually"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>From File</Text>
        <TextInput
          style={styles.input}
          value={wavPath}
          onChangeText={setWavPath}
          placeholder="WAV file path"
          placeholderTextColor="#aaa"
        />
        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.5 }]}
          onPress={handleFileVAD}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Detect Speech Segments</Text>
          )}
        </TouchableOpacity>

        {elapsed !== null && (
          <Text style={styles.resultText}>Processed in {elapsed}ms</Text>
        )}
        {segments.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.resultLabel}>{segments.length} segment(s) detected:</Text>
            {segments.map((seg, i) => (
              <Text key={i} style={styles.cardValue}>
                #{i + 1}: start={seg.start} samples={seg.durationSamples} (~{(seg.durationSamples / 16000).toFixed(2)}s)
              </Text>
            ))}
          </View>
        )}
        {segments.length === 0 && elapsed !== null && !error && (
          <Text style={styles.resultText}>No speech segments detected.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Live Mic</Text>
        <View style={styles.buttonRow}>
          {!liveMic ? (
            <TouchableOpacity style={[styles.button, styles.halfButton]} onPress={startLiveVAD}>
              <Text style={styles.buttonText}>Start Live VAD</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.button, styles.buttonDanger, styles.halfButton]} onPress={stopLiveVAD}>
              <Text style={styles.buttonText}>Stop</Text>
            </TouchableOpacity>
          )}
        </View>

        {liveMic && (
          <View style={[styles.banner, speechDetected ? styles.bannerPass : styles.bannerFail, { marginTop: 10 }]}>
            <Text style={styles.bannerText}>
              {speechDetected ? 'Speech Detected' : 'Silence'}
            </Text>
          </View>
        )}

        {liveSegments.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.resultLabel}>{liveSegments.length} segment(s) so far:</Text>
            {liveSegments.slice(-10).map((seg, i) => (
              <Text key={i} style={styles.cardValue}>
                start={seg.start} (~{(seg.durationSamples / 16000).toFixed(2)}s)
              </Text>
            ))}
            {liveSegments.length > 10 && (
              <Text style={styles.moreText}>...and {liveSegments.length - 10} more</Text>
            )}
          </View>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function buildVadConfig(modelPath: string): VadModelConfig {
  const isTen = modelPath.toLowerCase().includes('ten');
  if (isTen) {
    return {
      tenVadModelConfig: {
        model: modelPath,
        threshold: 0.5,
        minSilenceDuration: 0.25,
        minSpeechDuration: 0.25,
        windowSize: 256,
        maxSpeechDuration: 5.0,
      },
      sampleRate: 16000,
      numThreads: 1,
      provider: 'cpu',
    };
  }
  return {
    sileroVadModelConfig: {
      model: modelPath,
      threshold: 0.5,
      minSilenceDuration: 0.25,
      minSpeechDuration: 0.25,
      windowSize: 512,
      maxSpeechDuration: 5.0,
    },
    sampleRate: 16000,
    numThreads: 1,
    provider: 'cpu',
  };
}

