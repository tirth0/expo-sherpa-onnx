import ExpoSherpaOnnxModule from './ExpoSherpaOnnxModule';
import type { SpeakerEmbeddingExtractorConfig } from './ExpoSherpaOnnx.types';

export interface SpeakerEmbeddingStream {
  readonly streamHandle: number;
  acceptWaveform(samples: number[], sampleRate?: number): Promise<void>;
  isReady(): Promise<boolean>;
  compute(): Promise<number[]>;
  destroy(): Promise<void>;
}

export interface SpeakerEmbeddingExtractorEngine {
  readonly handle: number;
  dim(): Promise<number>;
  createStream(): Promise<SpeakerEmbeddingStream>;
  computeEmbeddingFromFile(filePath: string): Promise<number[]>;
  destroy(): Promise<void>;
}

export interface SpeakerEmbeddingManagerEngine {
  readonly handle: number;
  add(name: string, embedding: number[]): Promise<boolean>;
  addList(name: string, embeddings: number[][]): Promise<boolean>;
  remove(name: string): Promise<boolean>;
  search(embedding: number[], threshold: number): Promise<string>;
  verify(name: string, embedding: number[], threshold: number): Promise<boolean>;
  contains(name: string): Promise<boolean>;
  numSpeakers(): Promise<number>;
  allSpeakerNames(): Promise<string[]>;
  destroy(): Promise<void>;
}

export async function createSpeakerEmbeddingExtractor(
  config: SpeakerEmbeddingExtractorConfig
): Promise<SpeakerEmbeddingExtractorEngine> {
  const extractorHandle = await ExpoSherpaOnnxModule.createSpeakerEmbeddingExtractor(
    config as unknown as Record<string, unknown>
  );
  let destroyed = false;

  return {
    get handle() {
      return extractorHandle;
    },

    async dim(): Promise<number> {
      if (destroyed) throw new Error('SpeakerEmbeddingExtractor has been destroyed');
      return ExpoSherpaOnnxModule.speakerExtractorDim(extractorHandle);
    },

    async computeEmbeddingFromFile(filePath: string): Promise<number[]> {
      if (destroyed) throw new Error('SpeakerEmbeddingExtractor has been destroyed');
      return ExpoSherpaOnnxModule.speakerExtractorComputeFromFile(extractorHandle, filePath);
    },

    async createStream(): Promise<SpeakerEmbeddingStream> {
      if (destroyed) throw new Error('SpeakerEmbeddingExtractor has been destroyed');
      const streamHandle = await ExpoSherpaOnnxModule.speakerExtractorCreateStream(extractorHandle);
      let streamDestroyed = false;

      return {
        get streamHandle() {
          return streamHandle;
        },

        async acceptWaveform(samples: number[], sampleRate = 16000): Promise<void> {
          if (streamDestroyed) throw new Error('SpeakerEmbeddingStream has been destroyed');
          return ExpoSherpaOnnxModule.speakerStreamAcceptWaveform(streamHandle, samples, sampleRate);
        },

        async isReady(): Promise<boolean> {
          if (streamDestroyed) throw new Error('SpeakerEmbeddingStream has been destroyed');
          return ExpoSherpaOnnxModule.speakerExtractorIsReady(extractorHandle, streamHandle);
        },

        async compute(): Promise<number[]> {
          if (streamDestroyed) throw new Error('SpeakerEmbeddingStream has been destroyed');
          return ExpoSherpaOnnxModule.speakerExtractorCompute(extractorHandle, streamHandle);
        },

        async destroy(): Promise<void> {
          if (streamDestroyed) return;
          streamDestroyed = true;
          await ExpoSherpaOnnxModule.destroySpeakerStream(streamHandle);
        },
      };
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroySpeakerEmbeddingExtractor(extractorHandle);
    },
  };
}

export async function createSpeakerEmbeddingManager(
  dim: number
): Promise<SpeakerEmbeddingManagerEngine> {
  const managerHandle = await ExpoSherpaOnnxModule.createSpeakerEmbeddingManager(dim);
  let destroyed = false;

  return {
    get handle() {
      return managerHandle;
    },

    async add(name: string, embedding: number[]): Promise<boolean> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerAdd(managerHandle, name, embedding);
    },

    async addList(name: string, embeddings: number[][]): Promise<boolean> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerAddList(managerHandle, name, embeddings);
    },

    async remove(name: string): Promise<boolean> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerRemove(managerHandle, name);
    },

    async search(embedding: number[], threshold: number): Promise<string> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerSearch(managerHandle, embedding, threshold);
    },

    async verify(name: string, embedding: number[], threshold: number): Promise<boolean> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerVerify(managerHandle, name, embedding, threshold);
    },

    async contains(name: string): Promise<boolean> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerContains(managerHandle, name);
    },

    async numSpeakers(): Promise<number> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerNumSpeakers(managerHandle);
    },

    async allSpeakerNames(): Promise<string[]> {
      if (destroyed) throw new Error('SpeakerEmbeddingManager has been destroyed');
      return ExpoSherpaOnnxModule.speakerManagerAllSpeakerNames(managerHandle);
    },

    async destroy(): Promise<void> {
      if (destroyed) return;
      destroyed = true;
      await ExpoSherpaOnnxModule.destroySpeakerEmbeddingManager(managerHandle);
    },
  };
}
