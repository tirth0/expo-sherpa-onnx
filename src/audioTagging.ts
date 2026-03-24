import ExpoSherpaOnnxModule from "./ExpoSherpaOnnxModule";
import type { AudioTaggingConfig, AudioEvent } from "./ExpoSherpaOnnx.types";

export interface AudioTaggingEngine {
  handle: number;
  compute(
    samples: number[],
    sampleRate?: number,
    topK?: number
  ): Promise<AudioEvent[]>;
  computeFromFile(filePath: string, topK?: number): Promise<AudioEvent[]>;
  destroy(): Promise<void>;
}

export async function createAudioTagging(
  config: AudioTaggingConfig
): Promise<AudioTaggingEngine> {
  const handle = await ExpoSherpaOnnxModule.createAudioTagging(
    config as unknown as Record<string, unknown>
  );

  return {
    handle,
    async compute(
      samples: number[],
      sampleRate = 16000,
      topK = -1
    ): Promise<AudioEvent[]> {
      return ExpoSherpaOnnxModule.audioTaggingCompute(
        handle,
        samples,
        sampleRate,
        topK
      );
    },
    async computeFromFile(filePath: string, topK = -1): Promise<AudioEvent[]> {
      return ExpoSherpaOnnxModule.audioTaggingComputeFromFile(
        handle,
        filePath,
        topK
      );
    },
    async destroy(): Promise<void> {
      return ExpoSherpaOnnxModule.destroyAudioTagging(handle);
    },
  };
}
