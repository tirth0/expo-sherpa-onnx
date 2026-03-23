import ExpoSherpaOnnxModule from './ExpoSherpaOnnxModule';
import type {
  OfflineSpeakerDiarizationConfig,
  DiarizationSegment,
  TranscribedDiarizationSegment,
} from './ExpoSherpaOnnx.types';

export interface OfflineSpeakerDiarizationEngine {
  readonly handle: number;
  getSampleRate(): Promise<number>;
  process(samples: number[]): Promise<DiarizationSegment[]>;
  processFile(filePath: string): Promise<DiarizationSegment[]>;
  transcribeAndDiarizeFile(
    asrHandle: number,
    filePath: string
  ): Promise<TranscribedDiarizationSegment[]>;
  setConfig(config: OfflineSpeakerDiarizationConfig): Promise<void>;
  destroy(): Promise<void>;
}

export async function createOfflineSpeakerDiarization(
  config: OfflineSpeakerDiarizationConfig
): Promise<OfflineSpeakerDiarizationEngine> {
  const handle = await ExpoSherpaOnnxModule.createOfflineSpeakerDiarization(
    config as unknown as Record<string, unknown>
  );
  let destroyed = false;

  return {
    get handle() {
      return handle;
    },

    async getSampleRate(): Promise<number> {
      if (destroyed) throw new Error('OfflineSpeakerDiarization has been destroyed');
      return ExpoSherpaOnnxModule.offlineSpeakerDiarizationGetSampleRate(handle);
    },

    async process(samples: number[]): Promise<DiarizationSegment[]> {
      if (destroyed) throw new Error('OfflineSpeakerDiarization has been destroyed');
      return ExpoSherpaOnnxModule.offlineSpeakerDiarizationProcess(handle, samples);
    },

    async processFile(filePath: string): Promise<DiarizationSegment[]> {
      if (destroyed) throw new Error('OfflineSpeakerDiarization has been destroyed');
      return ExpoSherpaOnnxModule.offlineSpeakerDiarizationProcessFile(handle, filePath);
    },

    async transcribeAndDiarizeFile(
      asrHandle: number,
      filePath: string
    ): Promise<TranscribedDiarizationSegment[]> {
      if (destroyed) throw new Error('OfflineSpeakerDiarization has been destroyed');
      return ExpoSherpaOnnxModule.transcribeAndDiarizeFile(handle, asrHandle, filePath);
    },

    async setConfig(config: OfflineSpeakerDiarizationConfig): Promise<void> {
      if (destroyed) throw new Error('OfflineSpeakerDiarization has been destroyed');
      return ExpoSherpaOnnxModule.offlineSpeakerDiarizationSetConfig(
        handle,
        config as unknown as Record<string, unknown>
      );
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroyOfflineSpeakerDiarization(handle);
    },
  };
}
