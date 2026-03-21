import { useState, useCallback } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import ExpoSherpaOnnx, {
  assetModelPath,
  fileModelPath,
  autoModelPath,
  resolveModelPath,
  listModelsAtPath,
  detectSttModel,
  detectTtsModel,
} from 'expo-sherpa-onnx';
import type { ModelPathConfig, DetectedSttModel, DetectedTtsModel } from 'expo-sherpa-onnx';
import { styles } from '../styles';

type PathType = 'asset' | 'file' | 'auto';

export function ModelManagerScreen() {
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
