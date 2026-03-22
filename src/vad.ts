import ExpoSherpaOnnxModule from './ExpoSherpaOnnxModule';
import type { VadModelConfig, SpeechSegment } from './ExpoSherpaOnnx.types';

export interface VADEngine {
  readonly handle: number;
  acceptWaveform(samples: number[]): Promise<void>;
  empty(): Promise<boolean>;
  isSpeechDetected(): Promise<boolean>;
  pop(): Promise<void>;
  front(): Promise<SpeechSegment>;
  clear(): Promise<void>;
  reset(): Promise<void>;
  flush(): Promise<void>;
  destroy(): Promise<void>;
}

export async function createVAD(
  config: VadModelConfig,
  bufferSizeInSeconds = 30.0
): Promise<VADEngine> {
  const handle = await ExpoSherpaOnnxModule.createVad(
    config as unknown as Record<string, unknown>,
    bufferSizeInSeconds
  );
  let destroyed = false;

  return {
    get handle() {
      return handle;
    },

    async acceptWaveform(samples: number[]): Promise<void> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadAcceptWaveform(handle, samples);
    },

    async empty(): Promise<boolean> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadEmpty(handle);
    },

    async isSpeechDetected(): Promise<boolean> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadIsSpeechDetected(handle);
    },

    async pop(): Promise<void> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadPop(handle);
    },

    async front(): Promise<SpeechSegment> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadFront(handle);
    },

    async clear(): Promise<void> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadClear(handle);
    },

    async reset(): Promise<void> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadReset(handle);
    },

    async flush(): Promise<void> {
      if (destroyed) throw new Error('VADEngine has been destroyed');
      return ExpoSherpaOnnxModule.vadFlush(handle);
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroyVad(handle);
    },
  };
}
