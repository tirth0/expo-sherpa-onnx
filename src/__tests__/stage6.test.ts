jest.mock("expo", () => ({
  requireNativeModule: () => require("../../mocks/ExpoSherpaOnnx"),
}));

import { createSpokenLanguageIdentification } from "../languageId";
import { createAudioTagging } from "../audioTagging";
import {
  createOfflinePunctuation,
  createOnlinePunctuation,
} from "../punctuation";
import {
  createOfflineSpeechDenoiser,
  createOnlineSpeechDenoiser,
} from "../denoising";
import { saveAudioToFile, shareAudioFile } from "../fileUtils";
import {
  WHISPER_LANGUAGES,
  SENSE_VOICE_LANGUAGES,
  CANARY_LANGUAGES,
  FUNASR_LANGUAGES,
  getLanguageName,
} from "../languages";

describe("Spoken Language Identification", () => {
  it("creates engine and returns handle", async () => {
    const engine = await createSpokenLanguageIdentification({
      whisper: { encoder: "/mock/encoder.onnx", decoder: "/mock/decoder.onnx" },
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("compute returns a language code", async () => {
    const engine = await createSpokenLanguageIdentification({
      whisper: { encoder: "/mock/encoder.onnx", decoder: "/mock/decoder.onnx" },
    });
    const lang = await engine.compute([0.1, 0.2, 0.3], 16000);
    expect(typeof lang).toBe("string");
    expect(lang.length).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("computeFromFile returns a language code", async () => {
    const engine = await createSpokenLanguageIdentification({
      whisper: { encoder: "/mock/encoder.onnx", decoder: "/mock/decoder.onnx" },
    });
    const lang = await engine.computeFromFile("/mock/test.wav");
    expect(typeof lang).toBe("string");
    expect(lang).toBe("en");
    await engine.destroy();
  });
});

describe("Audio Tagging", () => {
  it("creates engine and returns handle", async () => {
    const engine = await createAudioTagging({
      model: { ced: "/mock/model.onnx" },
      labels: "/mock/labels.csv",
      topK: 3,
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("compute returns AudioEvent[]", async () => {
    const engine = await createAudioTagging({
      model: { ced: "/mock/model.onnx" },
      labels: "/mock/labels.csv",
    });
    const events = await engine.compute([0.1, 0.2, 0.3], 16000, 3);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("name");
    expect(events[0]).toHaveProperty("index");
    expect(events[0]).toHaveProperty("prob");
    await engine.destroy();
  });

  it("computeFromFile returns AudioEvent[]", async () => {
    const engine = await createAudioTagging({
      model: { ced: "/mock/model.onnx" },
      labels: "/mock/labels.csv",
    });
    const events = await engine.computeFromFile("/mock/test.wav", 3);
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    await engine.destroy();
  });
});

describe("Offline Punctuation", () => {
  it("creates engine and returns handle", async () => {
    const engine = await createOfflinePunctuation({
      model: { ctTransformer: "/mock/punct.onnx" },
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("addPunctuation returns punctuated text", async () => {
    const engine = await createOfflinePunctuation({
      model: { ctTransformer: "/mock/punct.onnx" },
    });
    const result = await engine.addPunctuation("hello world");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    await engine.destroy();
  });
});

describe("Online Punctuation", () => {
  it("creates engine and returns handle", async () => {
    const engine = await createOnlinePunctuation({
      model: { cnnBilstm: "/mock/punct.onnx", bpeVocab: "/mock/vocab.txt" },
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("addPunctuation returns punctuated text", async () => {
    const engine = await createOnlinePunctuation({
      model: { cnnBilstm: "/mock/punct.onnx", bpeVocab: "/mock/vocab.txt" },
    });
    const result = await engine.addPunctuation("hello world");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    await engine.destroy();
  });
});

describe("Offline Speech Denoiser", () => {
  it("creates engine and returns handle", async () => {
    const engine = await createOfflineSpeechDenoiser({
      model: { gtcrn: { model: "/mock/gtcrn.onnx" } },
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("run returns DenoisedAudio", async () => {
    const engine = await createOfflineSpeechDenoiser({
      model: { gtcrn: { model: "/mock/gtcrn.onnx" } },
    });
    const result = await engine.run([0.1, 0.2, 0.3], 16000);
    expect(result).toHaveProperty("samples");
    expect(result).toHaveProperty("sampleRate");
    expect(Array.isArray(result.samples)).toBe(true);
    await engine.destroy();
  });

  it("runFromFile returns DenoisedAudio", async () => {
    const engine = await createOfflineSpeechDenoiser({
      model: { gtcrn: { model: "/mock/gtcrn.onnx" } },
    });
    const result = await engine.runFromFile("/mock/noisy.wav");
    expect(result).toHaveProperty("samples");
    expect(result).toHaveProperty("sampleRate");
    await engine.destroy();
  });

  it("saveToFile returns outputPath and sampleRate", async () => {
    const engine = await createOfflineSpeechDenoiser({
      model: { gtcrn: { model: "/mock/gtcrn.onnx" } },
    });
    const result = await engine.saveToFile(
      "/mock/noisy.wav",
      "/mock/clean.wav"
    );
    expect(result.outputPath).toBe("/mock/clean.wav");
    expect(typeof result.sampleRate).toBe("number");
    await engine.destroy();
  });
});

describe("Online Speech Denoiser", () => {
  it("creates engine and returns handle", async () => {
    const engine = await createOnlineSpeechDenoiser({
      model: { gtcrn: { model: "/mock/gtcrn.onnx" } },
    });
    expect(engine.handle).toBeGreaterThan(0);
    await engine.destroy();
  });

  it("run returns DenoisedAudio", async () => {
    const engine = await createOnlineSpeechDenoiser({
      model: { gtcrn: { model: "/mock/gtcrn.onnx" } },
    });
    const result = await engine.run([0.1, 0.2, 0.3], 16000);
    expect(result).toHaveProperty("samples");
    expect(result).toHaveProperty("sampleRate");
    await engine.destroy();
  });

  it("flush returns remaining DenoisedAudio", async () => {
    const engine = await createOnlineSpeechDenoiser({
      model: { gtcrn: { model: "/mock/gtcrn.onnx" } },
    });
    const result = await engine.flush();
    expect(result).toHaveProperty("samples");
    expect(result).toHaveProperty("sampleRate");
    await engine.destroy();
  });
});

describe("File Utilities", () => {
  it("saveAudioToFile returns true", async () => {
    const result = await saveAudioToFile([0.1, 0.2], 16000, "/mock/out.wav");
    expect(result).toBe(true);
  });

  it("shareAudioFile resolves", async () => {
    await expect(shareAudioFile("/mock/out.wav")).resolves.toBeUndefined();
  });
});

describe("Language Helpers", () => {
  it("exports WHISPER_LANGUAGES with en", () => {
    expect(WHISPER_LANGUAGES).toHaveProperty("en", "English");
  });

  it("exports SENSE_VOICE_LANGUAGES with zh", () => {
    expect(SENSE_VOICE_LANGUAGES).toHaveProperty("zh", "Chinese");
  });

  it("exports CANARY_LANGUAGES with de", () => {
    expect(CANARY_LANGUAGES).toHaveProperty("de", "German");
  });

  it("exports FUNASR_LANGUAGES with auto", () => {
    expect(FUNASR_LANGUAGES).toHaveProperty("auto", "Auto Detect");
  });

  it("getLanguageName returns correct name", () => {
    expect(getLanguageName("en", "whisper")).toBe("English");
    expect(getLanguageName("zh", "sense_voice")).toBe("Chinese");
    expect(getLanguageName("fr", "canary")).toBe("French");
    expect(getLanguageName("unknown")).toBe("unknown");
  });
});
