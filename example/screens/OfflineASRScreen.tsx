import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import ExpoSherpaOnnx, { detectSttModel, createSTT } from 'expo-sherpa-onnx';
import type { OfflineRecognizerResult } from 'expo-sherpa-onnx';
import { styles } from '../styles';
import { useModelSubdirs } from '../hooks/useModelSubdirs';
import { buildOfflineConfigFromDetection } from '../utils/configBuilders';
import { base64ToFloat32 } from '../utils/audio';

export function OfflineASRScreen() {
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
