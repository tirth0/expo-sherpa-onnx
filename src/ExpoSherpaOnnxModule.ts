import { requireNativeModule } from 'expo';

import type { VersionInfo } from './ExpoSherpaOnnx.types';

interface ExpoSherpaOnnxNativeModule {
  getVersion(): string;
  getGitSha1(): string;
  getGitDate(): string;
  getVersionInfo(): VersionInfo;
}

export default requireNativeModule<ExpoSherpaOnnxNativeModule>('ExpoSherpaOnnx');
