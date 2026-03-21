import { useState, useEffect } from 'react';
import { Text, View, ActivityIndicator } from 'react-native';
import ExpoSherpaOnnx from 'expo-sherpa-onnx';
import type { VersionInfo } from 'expo-sherpa-onnx';
import { styles } from '../styles';

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

export function BuildVerificationScreen() {
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  useEffect(() => {
    setChecks(runBuildChecks());
  }, []);
  const allPassed = checks?.every((c) => c.pass) ?? false;

  return (
    <View>
      <Text style={styles.sectionTitle}>Build Verification</Text>
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
    </View>
  );
}
