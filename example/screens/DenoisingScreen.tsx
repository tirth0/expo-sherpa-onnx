import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { createOfflineSpeechDenoiser } from "expo-sherpa-onnx";
import type { OfflineSpeechDenoiserEngine } from "expo-sherpa-onnx";
import { styles } from "../styles";
import { useModelSubdirs } from "../hooks/useModelSubdirs";

export function DenoisingScreen() {
  const ExpoSherpaOnnx = require("expo-sherpa-onnx").default;
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === "function"
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: "" };
  const modelSubdirs = useModelSubdirs(appPaths.modelsDir);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [wavPath, setWavPath] = useState(
    appPaths.modelsDir ? `${appPaths.modelsDir}/cwryz.wav` : ""
  );
  const [result, setResult] = useState<{
    outputPath: string;
    sampleRate: number;
  } | null>(null);
  const engineRef = useRef<OfflineSpeechDenoiserEngine | null>(null);

  const denoiserModels = modelSubdirs.filter(
    (d) =>
      d.toLowerCase().includes("denois") ||
      d.toLowerCase().includes("gtcrn") ||
      d.toLowerCase().includes("dpdfnet")
  );

  useEffect(() => {
    if (!selectedModel && denoiserModels.length > 0) {
      setSelectedModel(denoiserModels[0]);
    }
  }, [denoiserModels, selectedModel]);

  const handleDenoise = async () => {
    if (!selectedModel) {
      Alert.alert("Error", "Select a denoiser model first");
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

      const isGtcrn = selectedModel.toLowerCase().includes("gtcrn");
      const engine = await createOfflineSpeechDenoiser({
        model: isGtcrn
          ? { gtcrn: { model: `${modelDir}/model.onnx` }, numThreads: 2 }
          : { dpdfnet: { model: `${modelDir}/model.onnx` }, numThreads: 2 },
      });
      engineRef.current = engine;

      const outputPath = wavPath.replace(".wav", "_denoised.wav");
      const saveResult = await engine.saveToFile(wavPath.trim(), outputPath);
      setResult(saveResult);
    } catch (e: any) {
      Alert.alert("Error", e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Speech Denoising</Text>

      <Text style={styles.label}>Denoiser Model:</Text>
      {denoiserModels.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {denoiserModels.map((m) => (
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
        <Text style={styles.mutedText}>No denoiser models found</Text>
      )}

      <Text style={styles.label}>Noisy WAV File Path:</Text>
      <TextInput
        style={styles.input}
        value={wavPath}
        onChangeText={setWavPath}
        placeholder="Path to .wav file"
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleDenoise}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Denoise Audio</Text>
        )}
      </TouchableOpacity>

      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Denoised Audio Saved</Text>
          <Text style={styles.resultText}>Path: {result.outputPath}</Text>
          <Text style={styles.resultText}>
            Sample Rate: {result.sampleRate} Hz
          </Text>
        </View>
      )}
    </View>
  );
}
