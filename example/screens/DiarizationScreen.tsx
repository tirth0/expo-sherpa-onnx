import { useState, useEffect, useCallback } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import ExpoSherpaOnnx, {
  createOfflineSpeakerDiarization,
  createSTT,
  detectSttModel,
  listModelsAtPath,
} from 'expo-sherpa-onnx';
import type { DiarizationSegment, TranscribedDiarizationSegment } from 'expo-sherpa-onnx';
import { styles } from '../styles';
import { useModelSubdirs } from '../hooks/useModelSubdirs';
import { buildOfflineConfigFromDetection } from '../utils/configBuilders';

type ModelFiles = {
  segmentationModel: string;
  embeddingModel: string;
};

function useDiarizationModels(modelsDir: string) {
  const [modelSets, setModelSets] = useState<{ label: string; files: ModelFiles }[]>([]);
  useEffect(() => {
    if (!modelsDir) return;
    listModelsAtPath(modelsDir, true)
      .then((items) => {
        const segModels = items.filter(
          (f) =>
            f.endsWith('.onnx') &&
            (f.toLowerCase().includes('segmentation') || f.toLowerCase().includes('pyannote'))
        );
        const embModels = items.filter(
          (f) =>
            f.endsWith('.onnx') &&
            (f.toLowerCase().includes('speaker') ||
              f.toLowerCase().includes('3dspeaker') ||
              f.toLowerCase().includes('ecapa') ||
              f.toLowerCase().includes('wespeaker') ||
              f.toLowerCase().includes('eres2net') ||
              f.toLowerCase().includes('campplus') ||
              f.toLowerCase().includes('embedding'))
        );

        const sets: { label: string; files: ModelFiles }[] = [];
        for (const seg of segModels) {
          for (const emb of embModels) {
            const segName = seg.split('/').pop() ?? seg;
            const embName = emb.split('/').pop() ?? emb;
            sets.push({
              label: `${segName} + ${embName}`,
              files: {
                segmentationModel: `${modelsDir}/${seg}`,
                embeddingModel: `${modelsDir}/${emb}`,
              },
            });
          }
        }
        setModelSets(sets);
      })
      .catch(() => setModelSets([]));
  }, [modelsDir]);
  return modelSets;
}

const COLORS = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

function speakerColor(speaker: number): string {
  return COLORS[speaker % COLORS.length];
}

export function DiarizationScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const modelSets = useDiarizationModels(appPaths.modelsDir);
  const asrSubdirs = useModelSubdirs(appPaths.modelsDir);

  const [segModelPath, setSegModelPath] = useState('');
  const [embModelPath, setEmbModelPath] = useState('');
  const [wavPath, setWavPath] = useState('');
  const [numClusters, setNumClusters] = useState('-1');
  const [clusterThreshold, setClusterThreshold] = useState('0.5');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [segments, setSegments] = useState<DiarizationSegment[]>([]);
  const [sampleRate, setSampleRate] = useState<number | null>(null);

  const [asrModelDir, setAsrModelDir] = useState('');
  const [transcribedSegments, setTranscribedSegments] = useState<TranscribedDiarizationSegment[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeElapsed, setTranscribeElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (modelSets.length > 0 && !segModelPath && !embModelPath) {
      setSegModelPath(modelSets[0].files.segmentationModel);
      setEmbModelPath(modelSets[0].files.embeddingModel);
    }
  }, [modelSets, segModelPath, embModelPath]);

  useEffect(() => {
    if (!asrModelDir && asrSubdirs.length > 0) {
      const offline = asrSubdirs.find(
        (d) => !d.includes('streaming') && !d.includes('pyannote') && !d.includes('vad') && !d.includes('tts')
      );
      if (offline) setAsrModelDir(`${appPaths.modelsDir}/${offline}`);
    }
  }, [asrSubdirs, asrModelDir, appPaths.modelsDir]);

  const buildDiarizationEngine = useCallback(async () => {
    const nc = parseInt(numClusters, 10);
    const th = parseFloat(clusterThreshold) || 0.5;
    return createOfflineSpeakerDiarization({
      segmentation: {
        pyannote: { model: segModelPath },
      },
      embedding: {
        model: embModelPath,
      },
      clustering: {
        numClusters: isNaN(nc) ? -1 : nc,
        threshold: th,
      },
    });
  }, [segModelPath, embModelPath, numClusters, clusterThreshold]);

  const handleDiarize = useCallback(async () => {
    if (!segModelPath.trim() || !embModelPath.trim() || !wavPath.trim()) {
      Alert.alert('Missing input', 'Provide segmentation model, embedding model, and WAV file paths.');
      return;
    }
    setLoading(true);
    setSegments([]);
    setTranscribedSegments([]);
    setError(null);
    setElapsed(null);
    setTranscribeElapsed(null);
    setSampleRate(null);
    try {
      const engine = await buildDiarizationEngine();
      const sr = await engine.getSampleRate();
      setSampleRate(sr);

      const t0 = Date.now();
      const result = await engine.processFile(wavPath);
      setElapsed(Date.now() - t0);
      setSegments(result);
      await engine.destroy();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [segModelPath, embModelPath, wavPath, buildDiarizationEngine]);

  const handleTranscribeAndDiarize = useCallback(async () => {
    if (!segModelPath.trim() || !embModelPath.trim() || !wavPath.trim()) {
      Alert.alert('Missing input', 'Provide segmentation model, embedding model, and WAV file paths.');
      return;
    }
    if (!asrModelDir.trim()) {
      Alert.alert('Missing ASR model', 'Select an offline ASR model directory for transcription.');
      return;
    }
    setTranscribing(true);
    setSegments([]);
    setTranscribedSegments([]);
    setError(null);
    setElapsed(null);
    setTranscribeElapsed(null);
    setSampleRate(null);
    try {
      const detected = await detectSttModel(asrModelDir.trim());
      const asrConfig = buildOfflineConfigFromDetection(detected, asrModelDir.trim());
      const asrEngine = await createSTT(asrConfig);

      const engine = await buildDiarizationEngine();
      const sr = await engine.getSampleRate();
      setSampleRate(sr);

      const t0 = Date.now();
      const result = await engine.transcribeAndDiarizeFile(asrEngine.handle, wavPath);
      setTranscribeElapsed(Date.now() - t0);
      setTranscribedSegments(result);
      setSegments(result.map((s) => ({ start: s.start, end: s.end, speaker: s.speaker })));

      await engine.destroy();
      await asrEngine.destroy();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setTranscribing(false);
    }
  }, [segModelPath, embModelPath, wavPath, asrModelDir, buildDiarizationEngine]);

  const uniqueSpeakers = [...new Set(segments.map((s) => s.speaker))].sort();
  const totalDuration = segments.length > 0 ? Math.max(...segments.map((s) => s.end)) : 0;
  const isLoading = loading || transcribing;

  return (
    <View>
      <Text style={styles.sectionTitle}>Speaker Diarization</Text>

      {/* Model Selection */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Model Pair</Text>
        {modelSets.length > 0 && (
          <View style={{ gap: 6, marginBottom: 8 }}>
            {modelSets.map((ms, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.radio,
                  segModelPath === ms.files.segmentationModel &&
                    embModelPath === ms.files.embeddingModel &&
                    styles.radioActive,
                ]}
                onPress={() => {
                  setSegModelPath(ms.files.segmentationModel);
                  setEmbModelPath(ms.files.embeddingModel);
                }}
              >
                <Text
                  style={[
                    styles.radioText,
                    segModelPath === ms.files.segmentationModel &&
                      embModelPath === ms.files.embeddingModel &&
                      styles.radioTextActive,
                  ]}
                  numberOfLines={2}
                >
                  {ms.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {modelSets.length === 0 && (
          <Text style={[styles.cardValue, { marginBottom: 6, color: '#888' }]}>
            No diarization models found. Place segmentation + embedding .onnx models in your models directory.
          </Text>
        )}
        <Text style={[styles.resultLabel, { marginTop: 4 }]}>Segmentation Model</Text>
        <TextInput
          style={styles.input}
          value={segModelPath}
          onChangeText={setSegModelPath}
          placeholder="Path to segmentation model (pyannote)"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.resultLabel}>Embedding Model</Text>
        <TextInput
          style={styles.input}
          value={embModelPath}
          onChangeText={setEmbModelPath}
          placeholder="Path to speaker embedding model"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Clustering Config */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Clustering</Text>
        <Text style={styles.resultLabel}>Number of Clusters (-1 = auto)</Text>
        <TextInput
          style={styles.input}
          value={numClusters}
          onChangeText={setNumClusters}
          placeholder="-1"
          placeholderTextColor="#aaa"
          keyboardType="number-pad"
        />
        <Text style={styles.resultLabel}>Threshold</Text>
        <TextInput
          style={styles.input}
          value={clusterThreshold}
          onChangeText={setClusterThreshold}
          placeholder="0.5"
          placeholderTextColor="#aaa"
          keyboardType="decimal-pad"
        />
      </View>

      {/* ASR Model (for Transcribe + Diarize) */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ASR Model (for Transcription)</Text>
        {asrSubdirs.length > 0 && (
          <View style={{ gap: 6, marginBottom: 8 }}>
            {asrSubdirs
              .filter((d) => !d.includes('streaming') && !d.includes('pyannote') && !d.includes('vad') && !d.includes('tts'))
              .map((dir) => {
                const fullPath = `${appPaths.modelsDir}/${dir}`;
                return (
                  <TouchableOpacity
                    key={dir}
                    style={[styles.radio, asrModelDir === fullPath && styles.radioActive]}
                    onPress={() => setAsrModelDir(fullPath)}
                  >
                    <Text
                      style={[styles.radioText, asrModelDir === fullPath && styles.radioTextActive]}
                      numberOfLines={1}
                    >
                      {dir}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        )}
        <TextInput
          style={styles.input}
          value={asrModelDir}
          onChangeText={setAsrModelDir}
          placeholder="Offline ASR model directory"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Process */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Audio File</Text>
        <TextInput
          style={styles.input}
          value={wavPath}
          onChangeText={setWavPath}
          placeholder="WAV file path"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.halfButton, isLoading && { opacity: 0.5 }]}
            onPress={handleDiarize}
            disabled={isLoading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Diarize Only</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.halfButton, { backgroundColor: '#8e44ad' }, isLoading && { opacity: 0.5 }]}
            onPress={handleTranscribeAndDiarize}
            disabled={isLoading}
          >
            {transcribing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Transcribe + Diarize</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Results */}
      {(elapsed !== null || transcribeElapsed !== null) && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Results</Text>
          {elapsed !== null && (
            <Text style={styles.resultText}>
              Diarized in {elapsed}ms | {uniqueSpeakers.length} speaker(s) | {segments.length} segment(s)
            </Text>
          )}
          {transcribeElapsed !== null && (
            <Text style={styles.resultText}>
              Transcribed + Diarized in {transcribeElapsed}ms | {uniqueSpeakers.length} speaker(s) | {transcribedSegments.length} segment(s)
            </Text>
          )}

          {sampleRate && (
            <Text style={[styles.cardValue, { marginTop: 4 }]}>Sample rate: {sampleRate} Hz</Text>
          )}

          {/* Speaker Legend */}
          {uniqueSpeakers.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 6 }}>
              {uniqueSpeakers.map((sp) => (
                <View key={sp} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: speakerColor(sp) }} />
                  <Text style={styles.cardValue}>Speaker {sp}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Timeline */}
          {totalDuration > 0 && (
            <View
              style={{
                height: 30,
                backgroundColor: '#eee',
                borderRadius: 6,
                overflow: 'hidden',
                marginTop: 6,
                flexDirection: 'row',
              }}
            >
              {segments.map((seg, i) => {
                const left = (seg.start / totalDuration) * 100;
                const width = ((seg.end - seg.start) / totalDuration) * 100;
                return (
                  <View
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      height: '100%',
                      backgroundColor: speakerColor(seg.speaker),
                      opacity: 0.8,
                    }}
                  />
                );
              })}
            </View>
          )}

          {/* Transcribed Segment List (with text) */}
          {transcribedSegments.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {transcribedSegments.map((seg, i) => (
                <View
                  key={i}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    marginBottom: 4,
                    backgroundColor: `${speakerColor(seg.speaker)}15`,
                    borderLeftWidth: 3,
                    borderLeftColor: speakerColor(seg.speaker),
                    borderRadius: 4,
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
                    Speaker {seg.speaker} | {seg.start.toFixed(2)}s - {seg.end.toFixed(2)}s
                  </Text>
                  <Text style={{ fontSize: 14, color: '#222' }}>
                    {seg.text || '(silence)'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Diarization-only Segment List (no text) */}
          {transcribedSegments.length === 0 && segments.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {segments.map((seg, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 3,
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: speakerColor(seg.speaker),
                    }}
                  />
                  <Text style={styles.cardValue}>
                    Speaker {seg.speaker}: {seg.start.toFixed(2)}s - {seg.end.toFixed(2)}s ({(seg.end - seg.start).toFixed(2)}s)
                  </Text>
                </View>
              ))}
            </View>
          )}

          {segments.length === 0 && transcribedSegments.length === 0 && (
            <Text style={[styles.cardValue, { marginTop: 8, color: '#888' }]}>
              No segments detected.
            </Text>
          )}
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}
