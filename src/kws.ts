import type {
  KeywordSpotterConfig,
  KeywordSpotterResult,
} from "./ExpoSherpaOnnx.types";
import ExpoSherpaOnnxModule from "./ExpoSherpaOnnxModule";

export interface KeywordStream {
  readonly streamHandle: number;
  acceptWaveform(samples: number[], sampleRate?: number): Promise<void>;
  isReady(): Promise<boolean>;
  decode(): Promise<void>;
  getResult(): Promise<KeywordSpotterResult>;
  reset(): Promise<void>;
  destroy(): Promise<void>;
}

export interface KeywordSpotterEngine {
  readonly handle: number;
  createStream(keywords?: string): Promise<KeywordStream>;
  destroy(): Promise<void>;
}

export async function createKeywordSpotter(
  config: KeywordSpotterConfig
): Promise<KeywordSpotterEngine> {
  const spotterHandle = await ExpoSherpaOnnxModule.createKeywordSpotter(
    config as unknown as Record<string, unknown>
  );
  let destroyed = false;

  return {
    get handle() {
      return spotterHandle;
    },

    async createStream(keywords = ""): Promise<KeywordStream> {
      if (destroyed) throw new Error("KeywordSpotterEngine has been destroyed");
      const streamHandle = await ExpoSherpaOnnxModule.createKeywordStream(
        spotterHandle,
        keywords
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
            throw new Error("KeywordStream has been destroyed");
          return ExpoSherpaOnnxModule.keywordStreamAcceptWaveform(
            streamHandle,
            samples,
            sampleRate
          );
        },

        async isReady(): Promise<boolean> {
          if (streamDestroyed)
            throw new Error("KeywordStream has been destroyed");
          return ExpoSherpaOnnxModule.keywordSpotterIsReady(
            spotterHandle,
            streamHandle
          );
        },

        async decode(): Promise<void> {
          if (streamDestroyed)
            throw new Error("KeywordStream has been destroyed");
          return ExpoSherpaOnnxModule.keywordSpotterDecode(
            spotterHandle,
            streamHandle
          );
        },

        async getResult(): Promise<KeywordSpotterResult> {
          if (streamDestroyed)
            throw new Error("KeywordStream has been destroyed");
          return ExpoSherpaOnnxModule.keywordSpotterGetResult(
            spotterHandle,
            streamHandle
          );
        },

        async reset(): Promise<void> {
          if (streamDestroyed)
            throw new Error("KeywordStream has been destroyed");
          return ExpoSherpaOnnxModule.keywordSpotterReset(
            spotterHandle,
            streamHandle
          );
        },

        async destroy(): Promise<void> {
          if (streamDestroyed) return;
          streamDestroyed = true;
          await ExpoSherpaOnnxModule.destroyKeywordStream(streamHandle);
        },
      };
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroyKeywordSpotter(spotterHandle);
    },
  };
}
