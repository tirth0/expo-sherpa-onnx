import ExpoSherpaOnnxModule from "./ExpoSherpaOnnxModule";
import type {
  OfflineSpeechDenoiserConfig,
  OnlineSpeechDenoiserConfig,
  DenoisedAudio,
} from "./ExpoSherpaOnnx.types";

export interface OfflineSpeechDenoiserEngine {
  handle: number;
  run(samples: number[], sampleRate?: number): Promise<DenoisedAudio>;
  runFromFile(filePath: string): Promise<DenoisedAudio>;
  saveToFile(
    inputPath: string,
    outputPath: string
  ): Promise<{ outputPath: string; sampleRate: number }>;
  destroy(): Promise<void>;
}

export interface OnlineSpeechDenoiserEngine {
  handle: number;
  run(samples: number[], sampleRate?: number): Promise<DenoisedAudio>;
  flush(): Promise<DenoisedAudio>;
  destroy(): Promise<void>;
}

export async function createOfflineSpeechDenoiser(
  config: OfflineSpeechDenoiserConfig
): Promise<OfflineSpeechDenoiserEngine> {
  const handle = await ExpoSherpaOnnxModule.createOfflineSpeechDenoiser(
    config as unknown as Record<string, unknown>
  );

  return {
    handle,
    async run(samples: number[], sampleRate = 16000): Promise<DenoisedAudio> {
      return ExpoSherpaOnnxModule.offlineSpeechDenoiserRun(
        handle,
        samples,
        sampleRate
      );
    },
    async runFromFile(filePath: string): Promise<DenoisedAudio> {
      return ExpoSherpaOnnxModule.offlineSpeechDenoiserRunFromFile(
        handle,
        filePath
      );
    },
    async saveToFile(
      inputPath: string,
      outputPath: string
    ): Promise<{ outputPath: string; sampleRate: number }> {
      return ExpoSherpaOnnxModule.offlineSpeechDenoiserSaveToFile(
        handle,
        inputPath,
        outputPath
      );
    },
    async destroy(): Promise<void> {
      return ExpoSherpaOnnxModule.destroyOfflineSpeechDenoiser(handle);
    },
  };
}

export async function createOnlineSpeechDenoiser(
  config: OnlineSpeechDenoiserConfig
): Promise<OnlineSpeechDenoiserEngine> {
  const handle = await ExpoSherpaOnnxModule.createOnlineSpeechDenoiser(
    config as unknown as Record<string, unknown>
  );

  return {
    handle,
    async run(samples: number[], sampleRate = 16000): Promise<DenoisedAudio> {
      return ExpoSherpaOnnxModule.onlineSpeechDenoiserRun(
        handle,
        samples,
        sampleRate
      );
    },
    async flush(): Promise<DenoisedAudio> {
      return ExpoSherpaOnnxModule.onlineSpeechDenoiserFlush(handle);
    },
    async destroy(): Promise<void> {
      return ExpoSherpaOnnxModule.destroyOnlineSpeechDenoiser(handle);
    },
  };
}
