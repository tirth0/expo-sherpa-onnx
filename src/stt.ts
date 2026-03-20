import ExpoSherpaOnnxModule from './ExpoSherpaOnnxModule';
import type {
  OfflineRecognizerConfig,
  OfflineRecognizerResult,
  OnlineRecognizerConfig,
  OnlineRecognizerResult,
  WaveData,
} from './ExpoSherpaOnnx.types';

// =============================================================================
// Offline STT Engine
// =============================================================================

export interface OfflineSTTEngine {
  readonly handle: number;
  transcribeSamples(
    samples: number[],
    sampleRate?: number
  ): Promise<OfflineRecognizerResult>;
  transcribeFile(filePath: string): Promise<OfflineRecognizerResult>;
  destroy(): Promise<void>;
}

export async function createSTT(
  config: OfflineRecognizerConfig
): Promise<OfflineSTTEngine> {
  const handle = await ExpoSherpaOnnxModule.createOfflineRecognizer(
    config as unknown as Record<string, unknown>
  );
  let destroyed = false;

  return {
    get handle() {
      return handle;
    },

    async transcribeSamples(
      samples: number[],
      sampleRate = 16000
    ): Promise<OfflineRecognizerResult> {
      if (destroyed) throw new Error('OfflineSTTEngine has been destroyed');
      return ExpoSherpaOnnxModule.offlineRecognizerDecode(
        handle,
        samples,
        sampleRate
      );
    },

    async transcribeFile(filePath: string): Promise<OfflineRecognizerResult> {
      if (destroyed) throw new Error('OfflineSTTEngine has been destroyed');
      return ExpoSherpaOnnxModule.offlineRecognizerDecodeFile(handle, filePath);
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroyOfflineRecognizer(handle);
    },
  };
}

// =============================================================================
// Online (Streaming) STT Engine
// =============================================================================

export interface OnlineSTTStream {
  readonly streamHandle: number;
  acceptWaveform(samples: number[], sampleRate?: number): Promise<void>;
  inputFinished(): Promise<void>;
  decode(): Promise<void>;
  isReady(): Promise<boolean>;
  isEndpoint(): Promise<boolean>;
  getResult(): Promise<OnlineRecognizerResult>;
  reset(): Promise<void>;
  destroy(): Promise<void>;
}

export interface OnlineSTTEngine {
  readonly handle: number;
  createStream(hotwords?: string): Promise<OnlineSTTStream>;
  destroy(): Promise<void>;
}

export async function createStreamingSTT(
  config: OnlineRecognizerConfig
): Promise<OnlineSTTEngine> {
  const recognizerHandle =
    await ExpoSherpaOnnxModule.createOnlineRecognizer(
      config as unknown as Record<string, unknown>
    );
  let destroyed = false;

  return {
    get handle() {
      return recognizerHandle;
    },

    async createStream(hotwords = ''): Promise<OnlineSTTStream> {
      if (destroyed) throw new Error('OnlineSTTEngine has been destroyed');
      const streamHandle = await ExpoSherpaOnnxModule.createOnlineStream(
        recognizerHandle,
        hotwords
      );
      let streamDestroyed = false;

      return {
        get streamHandle() {
          return streamHandle;
        },

        async acceptWaveform(
          samples: number[],
          sampleRate = 16000
        ): Promise<void> {
          if (streamDestroyed)
            throw new Error('OnlineSTTStream has been destroyed');
          await ExpoSherpaOnnxModule.onlineStreamAcceptWaveform(
            streamHandle,
            samples,
            sampleRate
          );
        },

        async inputFinished(): Promise<void> {
          if (streamDestroyed)
            throw new Error('OnlineSTTStream has been destroyed');
          await ExpoSherpaOnnxModule.onlineStreamInputFinished(streamHandle);
        },

        async decode(): Promise<void> {
          if (streamDestroyed)
            throw new Error('OnlineSTTStream has been destroyed');
          await ExpoSherpaOnnxModule.onlineRecognizerDecode(
            recognizerHandle,
            streamHandle
          );
        },

        async isReady(): Promise<boolean> {
          if (streamDestroyed)
            throw new Error('OnlineSTTStream has been destroyed');
          return ExpoSherpaOnnxModule.onlineRecognizerIsReady(
            recognizerHandle,
            streamHandle
          );
        },

        async isEndpoint(): Promise<boolean> {
          if (streamDestroyed)
            throw new Error('OnlineSTTStream has been destroyed');
          return ExpoSherpaOnnxModule.onlineRecognizerIsEndpoint(
            recognizerHandle,
            streamHandle
          );
        },

        async getResult(): Promise<OnlineRecognizerResult> {
          if (streamDestroyed)
            throw new Error('OnlineSTTStream has been destroyed');
          return ExpoSherpaOnnxModule.onlineRecognizerGetResult(
            recognizerHandle,
            streamHandle
          );
        },

        async reset(): Promise<void> {
          if (streamDestroyed)
            throw new Error('OnlineSTTStream has been destroyed');
          await ExpoSherpaOnnxModule.onlineRecognizerReset(
            recognizerHandle,
            streamHandle
          );
        },

        async destroy(): Promise<void> {
          if (streamDestroyed) return;
          streamDestroyed = true;
          await ExpoSherpaOnnxModule.destroyOnlineStream(streamHandle);
        },
      };
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroyOnlineRecognizer(recognizerHandle);
    },
  };
}

// =============================================================================
// Wave utilities
// =============================================================================

export function readWaveFile(filePath: string): Promise<WaveData> {
  return ExpoSherpaOnnxModule.readWaveFile(filePath);
}

// =============================================================================
// Hardware acceleration
// =============================================================================

export function getAvailableProviders(): string[] {
  return ExpoSherpaOnnxModule.getAvailableProviders();
}
