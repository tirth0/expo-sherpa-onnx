/// <reference types="jest" />
import {
  createSTT,
  createStreamingSTT,
  readWaveFile,
  getAvailableProviders,
} from "../stt";

describe("Offline STT (createSTT)", () => {
  it("creates an engine with a valid handle", async () => {
    const engine = await createSTT({
      modelConfig: {
        whisper: {
          encoder: "/mock/encoder.onnx",
          decoder: "/mock/decoder.onnx",
        },
        tokens: "/mock/tokens.txt",
      },
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("transcribeSamples returns a result with text", async () => {
    const engine = await createSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    const result = await engine.transcribeSamples([0.0, 0.1, -0.1], 16000);
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
    expect(Array.isArray(result.timestamps)).toBe(true);
    expect(typeof result.lang).toBe("string");
    await engine.destroy();
  });

  it("transcribeFile returns a result with text", async () => {
    const engine = await createSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    const result = await engine.transcribeFile("/mock/test.wav");
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("throws after destroy", async () => {
    const engine = await createSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    await engine.destroy();
    await expect(engine.transcribeSamples([0.0], 16000)).rejects.toThrow(
      "destroyed"
    );
  });

  it("double destroy is safe", async () => {
    const engine = await createSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    await engine.destroy();
    await expect(engine.destroy()).resolves.toBeUndefined();
  });
});

describe("Online STT (createStreamingSTT)", () => {
  it("creates a recognizer with a valid handle", async () => {
    const engine = await createStreamingSTT({
      modelConfig: {
        transducer: {
          encoder: "/mock/encoder.onnx",
          decoder: "/mock/decoder.onnx",
          joiner: "/mock/joiner.onnx",
        },
        tokens: "/mock/tokens.txt",
      },
      enableEndpoint: true,
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("creates a stream with a valid handle", async () => {
    const engine = await createStreamingSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    const stream = await engine.createStream();
    expect(stream.streamHandle).toBeGreaterThan(0);
    await stream.destroy();
    await engine.destroy();
  });

  it("stream lifecycle works end-to-end", async () => {
    const engine = await createStreamingSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    const stream = await engine.createStream();

    await stream.acceptWaveform([0.0, 0.1, -0.1, 0.05], 16000);
    const ready = await stream.isReady();
    expect(typeof ready).toBe("boolean");

    await stream.decode();
    const result = await stream.getResult();
    expect(typeof result.text).toBe("string");
    expect(Array.isArray(result.tokens)).toBe(true);
    expect(Array.isArray(result.timestamps)).toBe(true);

    const endpoint = await stream.isEndpoint();
    expect(typeof endpoint).toBe("boolean");

    await stream.reset();
    await stream.inputFinished();
    await stream.destroy();
    await engine.destroy();
  });

  it("stream throws after destroy", async () => {
    const engine = await createStreamingSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    const stream = await engine.createStream();
    await stream.destroy();
    await expect(stream.acceptWaveform([0.0], 16000)).rejects.toThrow(
      "destroyed"
    );
  });

  it("engine throws after destroy", async () => {
    const engine = await createStreamingSTT({
      modelConfig: { tokens: "/mock/tokens.txt" },
    });
    await engine.destroy();
    await expect(engine.createStream()).rejects.toThrow("destroyed");
  });
});

describe("readWaveFile", () => {
  it("returns samples and sampleRate", async () => {
    const wave = await readWaveFile("/mock/test.wav");
    expect(Array.isArray(wave.samples)).toBe(true);
    expect(wave.samples.length).toBeGreaterThan(0);
    expect(typeof wave.sampleRate).toBe("number");
    expect(wave.sampleRate).toBeGreaterThan(0);
  });
});

describe("getAvailableProviders", () => {
  it("returns an array of strings including cpu", () => {
    const providers = getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
    expect(providers).toContain("cpu");
  });
});
