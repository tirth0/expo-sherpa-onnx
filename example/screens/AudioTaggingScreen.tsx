import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { createAudioTagging } from "expo-sherpa-onnx";
import type { AudioTaggingEngine, AudioEvent } from "expo-sherpa-onnx";
import { styles } from "../styles";
import { useModelSubdirs } from "../hooks/useModelSubdirs";

export function AudioTaggingScreen() {
  const ExpoSherpaOnnx = require("expo-sherpa-onnx").default;
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === "function"
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: "" };
  const modelSubdirs = useModelSubdirs(appPaths.modelsDir);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AudioEvent[]>([]);
  const [wavPath, setWavPath] = useState("");
  const engineRef = useRef<AudioTaggingEngine | null>(null);

  const taggingModels = modelSubdirs.filter(
    (d) =>
      d.toLowerCase().includes("audio-tagging") ||
      d.toLowerCase().includes("ced")
  );

  useEffect(() => {
    if (!selectedModel && taggingModels.length > 0) {
      setSelectedModel(taggingModels[0]);
    }
  }, [taggingModels, selectedModel]);

  useEffect(() => {
    if (selectedModel && appPaths.modelsDir) {
      setWavPath(`${appPaths.modelsDir}/${selectedModel}/test_wavs/1.wav`);
    }
  }, [selectedModel, appPaths.modelsDir]);

  const handleTag = async () => {
    if (!selectedModel) {
      Alert.alert("Error", "Select an audio tagging model first");
      return;
    }
    if (!wavPath.trim()) {
      Alert.alert("Error", "Enter a WAV file path");
      return;
    }

    setLoading(true);
    setEvents([]);
    try {
      if (engineRef.current) {
        await engineRef.current.destroy();
        engineRef.current = null;
      }

      const modelDir = `${appPaths.modelsDir}/${selectedModel}`;

      const isCed = selectedModel.toLowerCase().includes("ced");
      const engine = await createAudioTagging({
        model: isCed
          ? { ced: `${modelDir}/model.int8.onnx`, numThreads: 2 }
          : {
              zipformer: { model: `${modelDir}/model.int8.onnx` },
              numThreads: 2,
            },
        labels: `${modelDir}/class_labels_indices.csv`,
        topK: 5,
      });
      engineRef.current = engine;

      const result = await engine.computeFromFile(wavPath.trim(), 5);
      setEvents(result);
    } catch (e: any) {
      Alert.alert("Error", e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Audio Tagging</Text>

      <Text style={styles.label}>Audio Tagging Model:</Text>
      {taggingModels.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {taggingModels.map((m) => (
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
        <Text style={styles.mutedText}>No audio tagging models found</Text>
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
        onPress={handleTag}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Tag Audio</Text>
        )}
      </TouchableOpacity>

      {events.length > 0 && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>
            Audio Events (Top {events.length}):
          </Text>
          {events.map((ev, i) => (
            <View key={i} style={{ marginVertical: 4 }}>
              <Text style={styles.resultText}>
                {ev.name}: {(ev.prob * 100).toFixed(1)}%
              </Text>
              <View
                style={{
                  height: 8,
                  backgroundColor: "#4CAF50",
                  width: `${Math.min(ev.prob * 100, 100)}%` as any,
                  borderRadius: 4,
                  marginTop: 2,
                }}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
