import ExpoSherpaOnnxModule from "./ExpoSherpaOnnxModule";
import type {
  OfflinePunctuationConfig,
  OnlinePunctuationConfig,
} from "./ExpoSherpaOnnx.types";

export interface OfflinePunctuationEngine {
  handle: number;
  addPunctuation(text: string): Promise<string>;
  destroy(): Promise<void>;
}

export interface OnlinePunctuationEngine {
  handle: number;
  addPunctuation(text: string): Promise<string>;
  destroy(): Promise<void>;
}

export async function createOfflinePunctuation(
  config: OfflinePunctuationConfig
): Promise<OfflinePunctuationEngine> {
  const handle = await ExpoSherpaOnnxModule.createOfflinePunctuation(
    config as unknown as Record<string, unknown>
  );

  return {
    handle,
    async addPunctuation(text: string): Promise<string> {
      return ExpoSherpaOnnxModule.offlinePunctuationAddPunct(handle, text);
    },
    async destroy(): Promise<void> {
      return ExpoSherpaOnnxModule.destroyOfflinePunctuation(handle);
    },
  };
}

export async function createOnlinePunctuation(
  config: OnlinePunctuationConfig
): Promise<OnlinePunctuationEngine> {
  const handle = await ExpoSherpaOnnxModule.createOnlinePunctuation(
    config as unknown as Record<string, unknown>
  );

  return {
    handle,
    async addPunctuation(text: string): Promise<string> {
      return ExpoSherpaOnnxModule.onlinePunctuationAddPunct(handle, text);
    },
    async destroy(): Promise<void> {
      return ExpoSherpaOnnxModule.destroyOnlinePunctuation(handle);
    },
  };
}
