import { useState, useEffect } from 'react';
import { Text, View } from 'react-native';
import { getAvailableProviders } from 'expo-sherpa-onnx';
import { styles } from '../styles';

export function AccelerationScreen() {
  const [providers, setProviders] = useState<string[]>([]);
  useEffect(() => {
    try {
      setProviders(getAvailableProviders());
    } catch (e: any) {
      setProviders([`Error: ${e.message}`]);
    }
  }, []);

  return (
    <View>
      <Text style={styles.sectionTitle}>Hardware Acceleration</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Available Providers</Text>
        <Text style={styles.pathLabel}>
          These providers can be passed as the &quot;provider&quot; field in model configs.
        </Text>
        {providers.map((p, i) => (
          <View key={i} style={[styles.copyRow, { marginTop: 6 }]}>
            <Text style={[styles.pathValue, { flex: 1 }]}>{p}</Text>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Usage</Text>
        <Text style={[styles.resultText, { fontSize: 12 }]} selectable>
          {`createSTT({
  modelConfig: {
    provider: "${providers.includes('coreml') ? 'coreml' : providers.includes('nnapi') ? 'nnapi' : 'cpu'}",
    // ... other config
  }
})`}
        </Text>
      </View>
    </View>
  );
}
