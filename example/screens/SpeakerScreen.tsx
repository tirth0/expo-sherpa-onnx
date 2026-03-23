import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import ExpoSherpaOnnx, {
  createSpeakerEmbeddingExtractor,
  createSpeakerEmbeddingManager,
  listModelsAtPath,
} from 'expo-sherpa-onnx';
import type {
  SpeakerEmbeddingExtractorEngine,
  SpeakerEmbeddingManagerEngine,
} from 'expo-sherpa-onnx';
import { styles } from '../styles';

function useSpeakerModels(modelsDir: string) {
  const [models, setModels] = useState<{ name: string; path: string }[]>([]);
  useEffect(() => {
    if (!modelsDir) return;
    listModelsAtPath(modelsDir, true)
      .then((items) => {
        const speakerFiles = items.filter(
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
        setModels(
          speakerFiles.map((f) => ({
            name: f.split('/').pop() ?? f,
            path: `${modelsDir}/${f}`,
          }))
        );
      })
      .catch(() => setModels([]));
  }, [modelsDir]);
  return models;
}

type EnrolledSpeaker = { name: string; embeddingCount: number };

export function SpeakerScreen() {
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === 'function'
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: '' };

  const speakerModels = useSpeakerModels(appPaths.modelsDir);
  const [modelPath, setModelPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const extractorRef = useRef<SpeakerEmbeddingExtractorEngine | null>(null);
  const managerRef = useRef<SpeakerEmbeddingManagerEngine | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [dim, setDim] = useState<number | null>(null);

  const [enrollName, setEnrollName] = useState('');
  const [enrollWavPath, setEnrollWavPath] = useState('');
  const [enrollStatus, setEnrollStatus] = useState<string | null>(null);
  const [enrolledSpeakers, setEnrolledSpeakers] = useState<EnrolledSpeaker[]>([]);

  const [verifyName, setVerifyName] = useState('');
  const [verifyWavPath, setVerifyWavPath] = useState('');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const [searchWavPath, setSearchWavPath] = useState('');
  const [searchResult, setSearchResult] = useState<string | null>(null);

  const [threshold, setThreshold] = useState('0.5');

  useEffect(() => {
    if (!modelPath && speakerModels.length > 0) {
      setModelPath(speakerModels[0].path);
    }
  }, [speakerModels, modelPath]);

  const refreshSpeakerList = useCallback(async () => {
    if (!managerRef.current) return;
    const names = await managerRef.current.allSpeakerNames();
    setEnrolledSpeakers(names.map((n) => ({ name: n, embeddingCount: 1 })));
  }, []);

  const initExtractor = useCallback(async () => {
    if (!modelPath.trim()) {
      Alert.alert('Missing model', 'Select or enter a speaker embedding model path.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (extractorRef.current) await extractorRef.current.destroy();
      if (managerRef.current) await managerRef.current.destroy();

      const extractor = await createSpeakerEmbeddingExtractor({ model: modelPath });
      const d = await extractor.dim();
      const manager = await createSpeakerEmbeddingManager(d);

      extractorRef.current = extractor;
      managerRef.current = manager;
      setDim(d);
      setInitialized(true);
      setEnrolledSpeakers([]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [modelPath]);

  const extractEmbedding = useCallback(
    async (wavPath: string): Promise<number[]> => {
      if (!extractorRef.current) throw new Error('Extractor not initialized');
      return extractorRef.current.computeEmbeddingFromFile(wavPath);
    },
    []
  );

  const handleEnroll = useCallback(async () => {
    if (!enrollName.trim() || !enrollWavPath.trim()) {
      Alert.alert('Missing input', 'Provide both a speaker name and a WAV file path.');
      return;
    }
    if (!managerRef.current) {
      Alert.alert('Not initialized', 'Initialize the extractor first.');
      return;
    }
    setLoading(true);
    setEnrollStatus(null);
    setError(null);
    try {
      const embedding = await extractEmbedding(enrollWavPath);
      const added = await managerRef.current.add(enrollName, embedding);
      setEnrollStatus(added ? `Enrolled "${enrollName}" successfully` : `Failed to enroll "${enrollName}"`);
      await refreshSpeakerList();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [enrollName, enrollWavPath, extractEmbedding, refreshSpeakerList]);

  const handleVerify = useCallback(async () => {
    if (!verifyName.trim() || !verifyWavPath.trim()) {
      Alert.alert('Missing input', 'Provide both a speaker name and a WAV file path.');
      return;
    }
    if (!managerRef.current) {
      Alert.alert('Not initialized', 'Initialize the extractor first.');
      return;
    }
    setLoading(true);
    setVerifyResult(null);
    setError(null);
    try {
      const embedding = await extractEmbedding(verifyWavPath);
      const th = parseFloat(threshold) || 0.5;
      const verified = await managerRef.current.verify(verifyName, embedding, th);
      setVerifyResult(
        verified
          ? `MATCH: Audio matches "${verifyName}" (threshold=${th})`
          : `NO MATCH: Audio does NOT match "${verifyName}" (threshold=${th})`
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [verifyName, verifyWavPath, threshold, extractEmbedding]);

  const handleSearch = useCallback(async () => {
    if (!searchWavPath.trim()) {
      Alert.alert('Missing input', 'Provide a WAV file path to search.');
      return;
    }
    if (!managerRef.current) {
      Alert.alert('Not initialized', 'Initialize the extractor first.');
      return;
    }
    setLoading(true);
    setSearchResult(null);
    setError(null);
    try {
      const embedding = await extractEmbedding(searchWavPath);
      const th = parseFloat(threshold) || 0.5;
      const name = await managerRef.current.search(embedding, th);
      setSearchResult(
        name ? `Best match: "${name}" (threshold=${th})` : `No matching speaker found (threshold=${th})`
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [searchWavPath, threshold, extractEmbedding]);

  const handleRemove = useCallback(
    async (name: string) => {
      if (!managerRef.current) return;
      await managerRef.current.remove(name);
      await refreshSpeakerList();
    },
    [refreshSpeakerList]
  );

  const cleanup = useCallback(async () => {
    if (extractorRef.current) {
      await extractorRef.current.destroy();
      extractorRef.current = null;
    }
    if (managerRef.current) {
      await managerRef.current.destroy();
      managerRef.current = null;
    }
    setInitialized(false);
    setDim(null);
    setEnrolledSpeakers([]);
    setEnrollStatus(null);
    setVerifyResult(null);
    setSearchResult(null);
  }, []);

  return (
    <View>
      <Text style={styles.sectionTitle}>Speaker Embedding</Text>

      {/* Model Selection */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Speaker Embedding Model</Text>
        {speakerModels.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {speakerModels.map((m) => (
              <TouchableOpacity
                key={m.path}
                style={[styles.radio, modelPath === m.path && styles.radioActive]}
                onPress={() => setModelPath(m.path)}
              >
                <Text
                  style={[styles.radioText, modelPath === m.path && styles.radioTextActive]}
                  numberOfLines={1}
                >
                  {m.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {speakerModels.length === 0 && (
          <Text style={[styles.cardValue, { marginBottom: 6, color: '#888' }]}>
            No speaker models found. Place a speaker embedding .onnx model in your models directory.
          </Text>
        )}
        <TextInput
          style={styles.input}
          value={modelPath}
          onChangeText={setModelPath}
          placeholder="Or enter model path manually"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.halfButton, loading && { opacity: 0.5 }]}
            onPress={initExtractor}
            disabled={loading}
          >
            {loading && !initialized ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>
                {initialized ? 'Reinitialize' : 'Initialize Extractor'}
              </Text>
            )}
          </TouchableOpacity>
          {initialized && (
            <TouchableOpacity
              style={[styles.button, styles.buttonDanger, styles.halfButton]}
              onPress={cleanup}
            >
              <Text style={styles.buttonText}>Destroy</Text>
            </TouchableOpacity>
          )}
        </View>
        {initialized && dim !== null && (
          <Text style={[styles.resultText, { marginTop: 8 }]}>
            Extractor ready (dim={dim})
          </Text>
        )}
      </View>

      {initialized && (
        <>
          {/* Threshold */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Similarity Threshold</Text>
            <TextInput
              style={styles.input}
              value={threshold}
              onChangeText={setThreshold}
              placeholder="0.5"
              placeholderTextColor="#aaa"
              keyboardType="decimal-pad"
            />
          </View>

          {/* Enroll */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Enroll Speaker</Text>
            <TextInput
              style={styles.input}
              value={enrollName}
              onChangeText={setEnrollName}
              placeholder="Speaker name (e.g. Alice)"
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={styles.input}
              value={enrollWavPath}
              onChangeText={setEnrollWavPath}
              placeholder="WAV file path for enrollment"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.5 }]}
              onPress={handleEnroll}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Enroll</Text>
              )}
            </TouchableOpacity>
            {enrollStatus && <Text style={styles.resultText}>{enrollStatus}</Text>}
          </View>

          {/* Enrolled Speakers */}
          {enrolledSpeakers.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>
                Enrolled Speakers ({enrolledSpeakers.length})
              </Text>
              {enrolledSpeakers.map((s) => (
                <View
                  key={s.name}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}
                >
                  <Text style={styles.cardValue}>{s.name}</Text>
                  <TouchableOpacity onPress={() => handleRemove(s.name)}>
                    <Text style={{ color: '#c0392b', fontSize: 13, fontWeight: '600' }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Verify */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Verify Speaker</Text>
            <TextInput
              style={styles.input}
              value={verifyName}
              onChangeText={setVerifyName}
              placeholder="Speaker name to verify against"
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={styles.input}
              value={verifyWavPath}
              onChangeText={setVerifyWavPath}
              placeholder="WAV file path"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.5 }]}
              onPress={handleVerify}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Verify</Text>
            </TouchableOpacity>
            {verifyResult && (
              <Text
                style={[
                  styles.resultText,
                  verifyResult.startsWith('NO MATCH') && { backgroundColor: '#fef2f2', color: '#c0392b' },
                ]}
              >
                {verifyResult}
              </Text>
            )}
          </View>

          {/* Search */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Search / Identify Speaker</Text>
            <TextInput
              style={styles.input}
              value={searchWavPath}
              onChangeText={setSearchWavPath}
              placeholder="WAV file path"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.5 }]}
              onPress={handleSearch}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Search</Text>
            </TouchableOpacity>
            {searchResult && <Text style={styles.resultText}>{searchResult}</Text>}
          </View>
        </>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}
