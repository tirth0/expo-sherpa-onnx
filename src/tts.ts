import { EventEmitter, type Subscription } from "expo-modules-core";

import ExpoSherpaOnnxModule from "./ExpoSherpaOnnxModule";
import type { OfflineTtsConfig, GeneratedAudio } from "./ExpoSherpaOnnx.types";

const emitter = new EventEmitter(ExpoSherpaOnnxModule);

// =============================================================================
// Offline TTS Engine (batch)
// =============================================================================

export interface OfflineTTSEngine {
  readonly handle: number;
  readonly sampleRate: number;
  readonly numSpeakers: number;
  generate(text: string, sid?: number, speed?: number): Promise<GeneratedAudio>;
  generateStreaming(
    text: string,
    callbacks: StreamingTTSCallbacks,
    sid?: number,
    speed?: number
  ): Promise<void>;
  destroy(): Promise<void>;
}

export type TtsChunkEvent = {
  requestId: string;
  samples: number[];
};

export type TtsCompleteEvent = {
  requestId: string;
  sampleRate: number;
};

export type TtsErrorEvent = {
  requestId: string;
  error: string;
};

export type StreamingTTSCallbacks = {
  onChunk: (samples: number[]) => void;
  onComplete?: (sampleRate: number) => void;
  onError?: (error: string) => void;
};

let requestCounter = 0;

export async function createTTS(
  config: OfflineTtsConfig
): Promise<OfflineTTSEngine> {
  const result = await ExpoSherpaOnnxModule.createOfflineTts(
    config as unknown as Record<string, unknown>
  );
  let destroyed = false;

  return {
    get handle() {
      return result.handle;
    },

    get sampleRate() {
      return result.sampleRate;
    },

    get numSpeakers() {
      return result.numSpeakers;
    },

    async generate(
      text: string,
      sid = 0,
      speed = 1.0
    ): Promise<GeneratedAudio> {
      if (destroyed) throw new Error("OfflineTTSEngine has been destroyed");
      return ExpoSherpaOnnxModule.offlineTtsGenerate(
        result.handle,
        text,
        sid,
        speed
      );
    },

    async generateStreaming(
      text: string,
      callbacks: StreamingTTSCallbacks,
      sid = 0,
      speed = 1.0
    ): Promise<void> {
      if (destroyed) throw new Error("OfflineTTSEngine has been destroyed");
      const requestId = `tts_${++requestCounter}_${Date.now()}`;

      const subscriptions: Subscription[] = [];

      return new Promise<void>((resolve, reject) => {
        subscriptions.push(
          emitter.addListener("ttsChunk", (event: TtsChunkEvent) => {
            if (event.requestId === requestId) {
              callbacks.onChunk(event.samples);
            }
          })
        );

        subscriptions.push(
          emitter.addListener("ttsComplete", (event: TtsCompleteEvent) => {
            if (event.requestId === requestId) {
              cleanup();
              callbacks.onComplete?.(event.sampleRate);
              resolve();
            }
          })
        );

        subscriptions.push(
          emitter.addListener("ttsError", (event: TtsErrorEvent) => {
            if (event.requestId === requestId) {
              cleanup();
              const msg = event.error;
              callbacks.onError?.(msg);
              reject(new Error(msg));
            }
          })
        );

        function cleanup() {
          subscriptions.forEach((s) => s.remove());
        }

        ExpoSherpaOnnxModule.offlineTtsGenerateStreaming(
          result.handle,
          text,
          sid,
          speed,
          requestId
        ).catch((err: Error) => {
          cleanup();
          callbacks.onError?.(err.message);
          reject(err);
        });
      });
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroyOfflineTts(result.handle);
    },
  };
}
