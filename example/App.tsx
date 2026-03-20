import { useState, useEffect } from 'react';
import ExpoSherpaOnnx from 'expo-sherpa-onnx';
import type { VersionInfo } from 'expo-sherpa-onnx';
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

type CheckResult = {
  label: string;
  value: string;
  pass: boolean;
};

function runBuildChecks(): CheckResult[] {
  const checks: CheckResult[] = [];

  try {
    const version = ExpoSherpaOnnx.getVersion();
    checks.push({
      label: 'Version',
      value: version,
      pass: typeof version === 'string' && version.length > 0,
    });
  } catch (e: any) {
    checks.push({ label: 'Version', value: e.message, pass: false });
  }

  try {
    const sha = ExpoSherpaOnnx.getGitSha1();
    checks.push({
      label: 'Git SHA1',
      value: sha,
      pass: typeof sha === 'string' && sha.length > 0,
    });
  } catch (e: any) {
    checks.push({ label: 'Git SHA1', value: e.message, pass: false });
  }

  try {
    const date = ExpoSherpaOnnx.getGitDate();
    checks.push({
      label: 'Git Date',
      value: date,
      pass: typeof date === 'string' && date.length > 0,
    });
  } catch (e: any) {
    checks.push({ label: 'Git Date', value: e.message, pass: false });
  }

  try {
    const info: VersionInfo = ExpoSherpaOnnx.getVersionInfo();
    checks.push({
      label: 'getVersionInfo()',
      value: JSON.stringify(info),
      pass:
        typeof info === 'object' &&
        typeof info.version === 'string' &&
        typeof info.gitSha1 === 'string' &&
        typeof info.gitDate === 'string',
    });
  } catch (e: any) {
    checks.push({ label: 'getVersionInfo()', value: e.message, pass: false });
  }

  return checks;
}

export default function App() {
  const [checks, setChecks] = useState<CheckResult[] | null>(null);

  useEffect(() => {
    setChecks(runBuildChecks());
  }, []);

  const allPassed = checks?.every((c) => c.pass) ?? false;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>expo-sherpa-onnx</Text>
        <Text style={styles.subtitle}>Build Verification</Text>

        {!checks ? (
          <ActivityIndicator size="large" style={styles.loader} />
        ) : (
          <>
            <View
              style={[
                styles.banner,
                allPassed ? styles.bannerPass : styles.bannerFail,
              ]}
            >
              <Text style={styles.bannerText}>
                {allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}
              </Text>
            </View>

            {checks.map((check, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.indicator}>
                    {check.pass ? '\u2705' : '\u274C'}
                  </Text>
                  <Text style={styles.cardLabel}>{check.label}</Text>
                </View>
                <Text style={styles.cardValue} selectable>
                  {check.value}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  loader: {
    marginTop: 40,
  },
  banner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  bannerPass: {
    backgroundColor: '#d4edda',
  },
  bannerFail: {
    backgroundColor: '#f8d7da',
  },
  bannerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  indicator: {
    fontSize: 18,
    marginRight: 8,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  cardValue: {
    fontSize: 14,
    color: '#444',
    fontFamily: 'monospace',
  },
});
