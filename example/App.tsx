import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { styles } from './styles';
import { BuildVerificationScreen } from './screens/BuildVerificationScreen';
import { ModelManagerScreen } from './screens/ModelManagerScreen';
import { OfflineASRScreen } from './screens/OfflineASRScreen';
import { StreamingASRScreen } from './screens/StreamingASRScreen';
import { OfflineTTSScreen } from './screens/OfflineTTSScreen';
import { StreamingTTSScreen } from './screens/StreamingTTSScreen';
import { AccelerationScreen } from './screens/AccelerationScreen';

type TabName = 'build' | 'models' | 'offlineASR' | 'streamingASR' | 'offlineTTS' | 'streamingTTS' | 'accel';

const TABS: { key: TabName; label: string }[] = [
  { key: 'build', label: 'Build' },
  { key: 'models', label: 'Models' },
  { key: 'offlineASR', label: 'Offline ASR' },
  { key: 'streamingASR', label: 'Stream ASR' },
  { key: 'offlineTTS', label: 'TTS' },
  { key: 'streamingTTS', label: 'Stream TTS' },
  { key: 'accel', label: 'Accel' },
];

function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabName>('build');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.title}>expo-sherpa-onnx</Text>
        {activeTab === 'build' && <BuildVerificationScreen />}
        {activeTab === 'models' && <ModelManagerScreen />}
        {activeTab === 'offlineASR' && <OfflineASRScreen />}
        {activeTab === 'streamingASR' && <StreamingASRScreen />}
        {activeTab === 'offlineTTS' && <OfflineTTSScreen />}
        {activeTab === 'streamingTTS' && <StreamingTTSScreen />}
        {activeTab === 'accel' && <AccelerationScreen />}
      </ScrollView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
