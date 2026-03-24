import ExpoSherpaOnnxModule from "./ExpoSherpaOnnxModule";
import type { SpokenLanguageIdentificationConfig } from "./ExpoSherpaOnnx.types";

export interface SpokenLanguageIdentificationEngine {
  handle: number;
  compute(samples: number[], sampleRate?: number): Promise<string>;
  computeFromFile(filePath: string): Promise<string>;
  destroy(): Promise<void>;
}

export async function createSpokenLanguageIdentification(
  config: SpokenLanguageIdentificationConfig
): Promise<SpokenLanguageIdentificationEngine> {
  const handle = await ExpoSherpaOnnxModule.createSpokenLanguageIdentification(
    config as unknown as Record<string, unknown>
  );

  return {
    handle,
    async compute(samples: number[], sampleRate = 16000): Promise<string> {
      return ExpoSherpaOnnxModule.spokenLanguageIdentificationCompute(
        handle,
        samples,
        sampleRate
      );
    },
    async computeFromFile(filePath: string): Promise<string> {
      return ExpoSherpaOnnxModule.spokenLanguageIdentificationComputeFromFile(
        handle,
        filePath
      );
    },
    async destroy(): Promise<void> {
      return ExpoSherpaOnnxModule.destroySpokenLanguageIdentification(handle);
    },
  };
}
