import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import ExpoSherpaOnnx, { detectTtsModel, createTTS } from 'expo-sherpa-onnx';
import type { DetectedTtsModel, OfflineTTSEngine } from 'expo-sherpa-onnx';
import { styles } from '../styles';
import { useModelSubdirs } from '../hooks/useModelSubdirs';
import { buildTtsConfigFromDetection } from '../utils/configBuilders';
import {
  playTtsAudio,
  stopTtsAudio,
  startTtsStream,
  feedTtsChunk,
  finishTtsStream,
  pickPlaybackRate,
} from '../utils/audio';

export function StreamingTTSScreen() {
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
