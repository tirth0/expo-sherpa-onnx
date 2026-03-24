import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from "react-native";
import {
  createOfflinePunctuation,
  createOnlinePunctuation,
} from "expo-sherpa-onnx";
import type {
  OfflinePunctuationEngine,
  OnlinePunctuationEngine,
} from "expo-sherpa-onnx";
import { styles } from "../styles";
import { useModelSubdirs } from "../hooks/useModelSubdirs";

export function PunctuationScreen() {
  const ExpoSherpaOnnx = require("expo-sherpa-onnx").default;
  const appPaths =
    typeof ExpoSherpaOnnx.getAppPaths === "function"
      ? ExpoSherpaOnnx.getAppPaths()
      : { modelsDir: "" };
  const modelSubdirs = useModelSubdirs(appPaths.modelsDir);
  const [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState(
    "hello how are you doing today i am fine thank you"
  );
  const [result, setResult] = useState("");
  const [isOnline, setIsOnline] = useState(false);
  const offlineRef = useRef<OfflinePunctuationEngine | null>(null);
  const onlineRef = useRef<OnlinePunctuationEngine | null>(null);

  const punctModels = modelSubdirs.filter((d) =>
    d.toLowerCase().includes("punct")
  );

  useEffect(() => {
    if (!selectedModel && punctModels.length > 0) {
      setSelectedModel(punctModels[0]);
    }
  }, [punctModels, selectedModel]);

  const handlePunctuate = async () => {
    if (!selectedModel) {
      Alert.alert("Error", "Select a punctuation model first");
      return;
    }
    if (!inputText.trim()) {
      Alert.alert("Error", "Enter some text");
      return;
    }

    setLoading(true);
    setResult("");
    try {
      const modelDir = `${appPaths.modelsDir}/${selectedModel}`;

      if (isOnline) {
        if (onlineRef.current) {
          await onlineRef.current.destroy();
          onlineRef.current = null;
        }
        const engine = await createOnlinePunctuation({
          model: {
            cnnBilstm: `${modelDir}/model.onnx`,
            bpeVocab: `${modelDir}/bpe.vocab`,
            numThreads: 2,
          },
        });
        onlineRef.current = engine;
        const punctuated = await engine.addPunctuation(inputText.trim());
        setResult(punctuated);
      } else {
        if (offlineRef.current) {
          await offlineRef.current.destroy();
          offlineRef.current = null;
        }
        const engine = await createOfflinePunctuation({
          model: {
            ctTransformer: `${modelDir}/model.onnx`,
            numThreads: 2,
          },
        });
        offlineRef.current = engine;
        const punctuated = await engine.addPunctuation(inputText.trim());
        setResult(punctuated);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Punctuation</Text>

      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
      >
        <Text style={styles.label}>Online Mode:</Text>
        <Switch
          value={isOnline}
          onValueChange={setIsOnline}
          style={{ marginLeft: 8 }}
        />
      </View>

      <Text style={styles.label}>Punctuation Model:</Text>
      {punctModels.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {punctModels.map((m) => (
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
        <Text style={styles.mutedText}>No punctuation models found</Text>
      )}

      <Text style={styles.label}>Input Text:</Text>
      <TextInput
        style={[styles.input, { height: 80, textAlignVertical: "top" }]}
        multiline
        value={inputText}
        onChangeText={setInputText}
        placeholder="Enter text without punctuation..."
        placeholderTextColor="#999"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handlePunctuate}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Add Punctuation</Text>
        )}
      </TouchableOpacity>

      {result.length > 0 && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Punctuated Text:</Text>
          <Text style={styles.resultText}>{result}</Text>
        </View>
      )}
    </View>
  );
}
