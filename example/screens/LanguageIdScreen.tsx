import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import {
  createSpokenLanguageIdentification,
  WHISPER_LANGUAGES,
} from "expo-sherpa-onnx";
import type { SpokenLanguageIdentificationEngine } from "expo-sherpa-onnx";
import { styles } from "../styles";
import { useModelSubdirs } from "../hooks/useModelSubdirs";

export function LanguageIdScreen() {
  const ExpoSherpaOnnx = require("expo-sherpa-onnx").default;
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === "function"
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: "" };
  const modelSubdirs = useModelSubdirs(appPaths.modelsDir);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [wavPath, setWavPath] = useState(
    appPaths.modelsDir ? `${appPaths.modelsDir}/cwryz.wav` : ""
  );
  const engineRef = useRef<SpokenLanguageIdentificationEngine | null>(null);

  const whisperModels = modelSubdirs.filter(
    (d) => d.toLowerCase().includes("whisper") && !d.includes("tts")
  );

  useEffect(() => {
    if (!selectedModel && whisperModels.length > 0) {
      setSelectedModel(whisperModels[0]);
    }
  }, [whisperModels, selectedModel]);

  const handleIdentify = async () => {
    if (!selectedModel) {
      Alert.alert("Error", "Select a whisper model first");
      return;
    }
    if (!wavPath.trim()) {
      Alert.alert("Error", "Enter a WAV file path");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      if (engineRef.current) {
        await engineRef.current.destroy();
        engineRef.current = null;
      }

      const modelDir = `${appPaths.modelsDir}/${selectedModel}`;

      const engine = await createSpokenLanguageIdentification({
        whisper: {
          encoder: `${modelDir}/tiny-encoder.int8.onnx`,
          decoder: `${modelDir}/tiny-decoder.int8.onnx`,
        },
        numThreads: 2,
      });
      engineRef.current = engine;

      const lang = await engine.computeFromFile(wavPath.trim());
      const langName = WHISPER_LANGUAGES[lang] || lang;
      setResult(`${lang} (${langName})`);
    } catch (e: any) {
      Alert.alert("Error", e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Spoken Language Identification</Text>

      <Text style={styles.label}>Whisper Model:</Text>
      {whisperModels.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {whisperModels.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.radio, selectedModel === m && styles.radioActive]}
              onPress={() => setSelectedModel(m)}
            >
              <Text
                style={[
                  styles.radioText,
                  selectedModel === m && styles.radioTextActive,
                ]}
                numberOfLines={1}
              >
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.mutedText}>No whisper models found</Text>
      )}

      <Text style={styles.label}>WAV File Path:</Text>
      <TextInput
        style={styles.input}
        value={wavPath}
        onChangeText={setWavPath}
        placeholder="Path to .wav file"
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleIdentify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Identify Language</Text>
        )}
      </TouchableOpacity>

      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Detected Language:</Text>
          <Text style={styles.resultText}>{result}</Text>
        </View>
      )}
    </View>
  );
}
