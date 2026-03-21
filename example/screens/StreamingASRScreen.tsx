import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';
import ExpoSherpaOnnx, { detectSttModel, createStreamingSTT, readWaveFile } from 'expo-sherpa-onnx';
import type { OnlineSTTEngine, OnlineSTTStream } from 'expo-sherpa-onnx';
import { styles } from '../styles';
import { useModelSubdirs } from '../hooks/useModelSubdirs';
import { buildOnlineConfigFromDetection } from '../utils/configBuilders';
import { base64ToFloat32 } from '../utils/audio';

export function StreamingASRScreen() {
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

      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      try {
        await ExpoPlayAudioStream.stopRecording();
      } catch (_) { }

      const stream = streamRef.current;
      const engine = engineRef.current;
      streamRef.current = null;
      engineRef.current = null;

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
