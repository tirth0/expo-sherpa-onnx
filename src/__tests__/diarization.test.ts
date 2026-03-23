/// <reference types="jest" />
import { createOfflineSpeakerDiarization } from "../diarization";

describe("Offline Speaker Diarization", () => {
  const mockConfig = {
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

  it("creates a diarization engine with a valid handle", async () => {
    const engine = await createOfflineSpeakerDiarization(mockConfig);
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("getSampleRate returns a positive integer", async () => {
    const engine = await createOfflineSpeakerDiarization(mockConfig);
    const sr = await engine.getSampleRate();
    expect(sr).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("process returns an array of segments", async () => {
    const engine = await createOfflineSpeakerDiarization(mockConfig);
    const samples = new Array(16000 * 5)
      .fill(0)
      .map(() => Math.random() * 2 - 1);
    const segments = await engine.process(samples);
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

  it("setConfig does not throw", async () => {
    const engine = await createOfflineSpeakerDiarization(mockConfig);
    await expect(
      engine.setConfig({
        clustering: { numClusters: 2 },
      })
    ).resolves.not.toThrow();
    await engine.destroy();
  });

  it("throws after destroy", async () => {
    const engine = await createOfflineSpeakerDiarization(mockConfig);
    await engine.destroy();
    await expect(engine.getSampleRate()).rejects.toThrow("destroyed");
    await expect(engine.process([])).rejects.toThrow("destroyed");
    await expect(engine.setConfig(mockConfig)).rejects.toThrow("destroyed");
  });

  it("double destroy is safe", async () => {
    const engine = await createOfflineSpeakerDiarization(mockConfig);
    await engine.destroy();
    await expect(engine.destroy()).resolves.not.toThrow();
  });
});
