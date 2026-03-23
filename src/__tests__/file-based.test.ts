/// <reference types="jest" />
import { createVAD } from "../vad";
import { createSpeakerEmbeddingExtractor } from "../speaker";
import { createOfflineSpeakerDiarization } from "../diarization";

const MOCK_WAV = "/mock/audio.wav";

describe("File-based VAD processing", () => {
  const vadConfig = {
    sileroVadModelConfig: {
      model: "/mock/silero_vad.onnx",
    },
  };

  it("processFile returns speech segments", async () => {
    const vad = await createVAD(vadConfig);
    const segments = await vad.processFile(MOCK_WAV);
    expect(Array.isArray(segments)).toBe(true);
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(typeof seg.start).toBe("number");
      expect(Array.isArray(seg.samples)).toBe(true);
      expect(seg.samples.length).toBeGreaterThan(0);
    }
    await vad.destroy();
  });

  it("processFile throws after destroy", async () => {
    const vad = await createVAD(vadConfig);
    await vad.destroy();
    await expect(vad.processFile(MOCK_WAV)).rejects.toThrow("destroyed");
  });
});

describe("File-based Speaker Embedding computation", () => {
  const extractorConfig = { model: "/mock/speaker_model.onnx" };

  it("computeEmbeddingFromFile returns an embedding array", async () => {
    const extractor = await createSpeakerEmbeddingExtractor(extractorConfig);
    const embedding = await extractor.computeEmbeddingFromFile(MOCK_WAV);
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    for (const val of embedding) {
      expect(typeof val).toBe("number");
    }
    await extractor.destroy();
  });

  it("computeEmbeddingFromFile throws after destroy", async () => {
    const extractor = await createSpeakerEmbeddingExtractor(extractorConfig);
    await extractor.destroy();
    await expect(extractor.computeEmbeddingFromFile(MOCK_WAV)).rejects.toThrow(
      "destroyed"
    );
  });
});

describe("File-based Diarization processing", () => {
  const diarizationConfig = {
    segmentation: {
      pyannote: { model: "/mock/segmentation.onnx" },
    },
    embedding: {
      model: "/mock/embedding.onnx",
    },
    clustering: {
      threshold: 0.5,
    },
  };

  it("processFile returns diarization segments", async () => {
    const engine = await createOfflineSpeakerDiarization(diarizationConfig);
    const segments = await engine.processFile(MOCK_WAV);
    expect(Array.isArray(segments)).toBe(true);
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(typeof seg.start).toBe("number");
      expect(typeof seg.end).toBe("number");
      expect(typeof seg.speaker).toBe("number");
      expect(seg.end).toBeGreaterThan(seg.start);
      expect(seg.speaker).toBeGreaterThanOrEqual(0);
    }
    await engine.destroy();
  });

  it("processFile throws after destroy", async () => {
    const engine = await createOfflineSpeakerDiarization(diarizationConfig);
    await engine.destroy();
    await expect(engine.processFile(MOCK_WAV)).rejects.toThrow("destroyed");
  });
});

describe("File-based Transcribe + Diarize", () => {
  const diarizationConfig = {
    segmentation: {
      pyannote: { model: "/mock/segmentation.onnx" },
    },
    embedding: {
      model: "/mock/embedding.onnx",
    },
    clustering: {
      threshold: 0.5,
    },
  };

  it("transcribeAndDiarizeFile returns segments with text", async () => {
    const engine = await createOfflineSpeakerDiarization(diarizationConfig);
    const mockAsrHandle = 42;
    const results = await engine.transcribeAndDiarizeFile(
      mockAsrHandle,
      MOCK_WAV
    );
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    for (const seg of results) {
      expect(typeof seg.speaker).toBe("number");
      expect(typeof seg.start).toBe("number");
      expect(typeof seg.end).toBe("number");
      expect(typeof seg.text).toBe("string");
      expect(seg.text.length).toBeGreaterThan(0);
    }
    await engine.destroy();
  });

  it("transcribeAndDiarizeFile throws after destroy", async () => {
    const engine = await createOfflineSpeakerDiarization(diarizationConfig);
    await engine.destroy();
    await expect(engine.transcribeAndDiarizeFile(42, MOCK_WAV)).rejects.toThrow(
      "destroyed"
    );
  });
});
