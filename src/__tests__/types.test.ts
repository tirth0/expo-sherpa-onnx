/// <reference types="jest" />
import type {
  ModelPathConfig,
  FeatureConfig,
  OnlineRecognizerConfig,
  OfflineRecognizerConfig,
  OfflineTtsConfig,
  VadModelConfig,
  KeywordSpotterConfig,
  SpeakerEmbeddingExtractorConfig,
  OfflineSpeakerDiarizationConfig,
  SpokenLanguageIdentificationConfig,
  AudioTaggingConfig,
  OnlinePunctuationConfig,
  OfflinePunctuationConfig,
  OfflineSpeechDenoiserConfig,
  OnlineSpeechDenoiserConfig,
  OnlineRecognizerResult,
  OfflineRecognizerResult,
  GeneratedAudio,
  SpeechSegment,
  KeywordSpotterResult,
  DiarizationSegment,
  AudioEvent,
  DenoisedAudio,
  GenerationConfig,
  DetectedSttModel,
  DetectedTtsModel,
} from "../ExpoSherpaOnnx.types";

describe("ModelPathConfig", () => {
  it("accepts asset type", () => {
    const config: ModelPathConfig = { type: "asset", path: "models/whisper" };
    expect(config.type).toBe("asset");
    expect(config.path).toBe("models/whisper");
  });

  it("accepts file type", () => {
    const config: ModelPathConfig = {
      type: "file",
      path: "/data/models/whisper",
    };
    expect(config.type).toBe("file");
  });

  it("accepts auto type", () => {
    const config: ModelPathConfig = { type: "auto", path: "whisper-tiny" };
    expect(config.type).toBe("auto");
  });
});

describe("FeatureConfig defaults", () => {
  it("allows empty config (all optional)", () => {
    const config: FeatureConfig = {};
    expect(config.sampleRate).toBeUndefined();
    expect(config.featureDim).toBeUndefined();
  });

  it("allows partial config", () => {
    const config: FeatureConfig = { sampleRate: 16000 };
    expect(config.sampleRate).toBe(16000);
  });
});

describe("Online ASR config", () => {
  it("allows minimal config", () => {
    const config: OnlineRecognizerConfig = {
      modelConfig: {
        tokens: "tokens.txt",
        transducer: {
          encoder: "encoder.onnx",
          decoder: "decoder.onnx",
          joiner: "joiner.onnx",
        },
      },
    };
    expect(config.modelConfig?.tokens).toBe("tokens.txt");
    expect(config.modelConfig?.transducer?.encoder).toBe("encoder.onnx");
  });

  it("allows empty config", () => {
    const config: OnlineRecognizerConfig = {};
    expect(config.modelConfig).toBeUndefined();
  });
});

describe("Offline ASR config", () => {
  it("supports whisper model config", () => {
    const config: OfflineRecognizerConfig = {
      modelConfig: {
        whisper: {
          encoder: "whisper-encoder.onnx",
          decoder: "whisper-decoder.onnx",
          language: "en",
          task: "transcribe",
        },
        tokens: "tokens.txt",
      },
    };
    expect(config.modelConfig?.whisper?.language).toBe("en");
  });

  it("supports sensevoice model config", () => {
    const config: OfflineRecognizerConfig = {
      modelConfig: {
        senseVoice: {
          model: "model.onnx",
          language: "auto",
          useInverseTextNormalization: true,
        },
      },
    };
    expect(config.modelConfig?.senseVoice?.useInverseTextNormalization).toBe(
      true
    );
  });
});

describe("TTS config", () => {
  it("supports vits model config", () => {
    const config: OfflineTtsConfig = {
      model: {
        vits: {
          model: "vits.onnx",
          tokens: "tokens.txt",
          lexicon: "lexicon.txt",
        },
      },
    };
    expect(config.model?.vits?.model).toBe("vits.onnx");
  });

  it("supports kokoro model config", () => {
    const config: OfflineTtsConfig = {
      model: {
        kokoro: {
          model: "kokoro.onnx",
          voices: "voices.bin",
          tokens: "tokens.txt",
        },
      },
    };
    expect(config.model?.kokoro?.voices).toBe("voices.bin");
  });

  it("supports generation config", () => {
    const gen: GenerationConfig = {
      speed: 1.2,
      sid: 0,
      silenceScale: 0.5,
    };
    expect(gen.speed).toBe(1.2);
  });
});

describe("VAD config", () => {
  it("allows silero vad config", () => {
    const config: VadModelConfig = {
      sileroVadModelConfig: {
        model: "silero_vad.onnx",
        threshold: 0.5,
        minSilenceDuration: 0.25,
      },
      sampleRate: 16000,
    };
    expect(config.sileroVadModelConfig?.threshold).toBe(0.5);
  });
});

describe("Keyword Spotting config", () => {
  it("supports basic config", () => {
    const config: KeywordSpotterConfig = {
      modelConfig: {
        transducer: {
          encoder: "encoder.onnx",
          decoder: "decoder.onnx",
          joiner: "joiner.onnx",
        },
      },
      keywordsFile: "keywords.txt",
      keywordsScore: 1.5,
    };
    expect(config.keywordsFile).toBe("keywords.txt");
  });
});

describe("Speaker configs", () => {
  it("supports embedding extractor config", () => {
    const config: SpeakerEmbeddingExtractorConfig = {
      model: "speaker.onnx",
      numThreads: 2,
    };
    expect(config.model).toBe("speaker.onnx");
  });

  it("supports diarization config", () => {
    const config: OfflineSpeakerDiarizationConfig = {
      segmentation: {
        pyannote: { model: "segmentation.onnx" },
      },
      embedding: { model: "embedding.onnx" },
      clustering: { numClusters: -1, threshold: 0.5 },
    };
    expect(config.clustering?.threshold).toBe(0.5);
  });
});

describe("Language ID config", () => {
  it("supports whisper-based config", () => {
    const config: SpokenLanguageIdentificationConfig = {
      whisper: {
        encoder: "encoder.onnx",
        decoder: "decoder.onnx",
      },
    };
    expect(config.whisper?.encoder).toBe("encoder.onnx");
  });
});

describe("Audio Tagging config", () => {
  it("supports basic config", () => {
    const config: AudioTaggingConfig = {
      model: {
        zipformer: { model: "model.onnx" },
      },
      labels: "labels.txt",
      topK: 5,
    };
    expect(config.topK).toBe(5);
  });
});

describe("Punctuation configs", () => {
  it("supports online punctuation", () => {
    const config: OnlinePunctuationConfig = {
      model: { cnnBilstm: "model.onnx", bpeVocab: "vocab.txt" },
    };
    expect(config.model?.cnnBilstm).toBe("model.onnx");
  });

  it("supports offline punctuation", () => {
    const config: OfflinePunctuationConfig = {
      model: { ctTransformer: "model.onnx" },
    };
    expect(config.model?.ctTransformer).toBe("model.onnx");
  });
});

describe("Speech Denoiser configs", () => {
  it("supports offline denoiser", () => {
    const config: OfflineSpeechDenoiserConfig = {
      model: { gtcrn: { model: "gtcrn.onnx" } },
    };
    expect(config.model?.gtcrn?.model).toBe("gtcrn.onnx");
  });

  it("supports online denoiser", () => {
    const config: OnlineSpeechDenoiserConfig = {
      model: { dpdfnet: { model: "dpdfnet.onnx" } },
    };
    expect(config.model?.dpdfnet?.model).toBe("dpdfnet.onnx");
  });
});

describe("Result types", () => {
  it("OnlineRecognizerResult has expected shape", () => {
    const result: OnlineRecognizerResult = {
      text: "hello world",
      tokens: ["hello", "world"],
      timestamps: [0.1, 0.5],
      ysProbs: [0.9, 0.85],
    };
    expect(result.text).toBe("hello world");
    expect(result.tokens).toHaveLength(2);
  });

  it("OfflineRecognizerResult has all fields", () => {
    const result: OfflineRecognizerResult = {
      text: "test",
      tokens: ["test"],
      timestamps: [0.0],
      lang: "en",
      emotion: "neutral",
      event: "",
      durations: [0.5],
    };
    expect(result.lang).toBe("en");
    expect(result.emotion).toBe("neutral");
  });

  it("GeneratedAudio has samples and sampleRate", () => {
    const audio: GeneratedAudio = {
      samples: [0.1, -0.2, 0.3],
      sampleRate: 22050,
    };
    expect(audio.samples).toHaveLength(3);
    expect(audio.sampleRate).toBe(22050);
  });

  it("SpeechSegment has start and samples", () => {
    const segment: SpeechSegment = {
      start: 1600,
      samples: [0.1, 0.2],
    };
    expect(segment.start).toBe(1600);
  });

  it("KeywordSpotterResult has keyword", () => {
    const result: KeywordSpotterResult = {
      keyword: "hey sherpa",
      tokens: ["hey", "sherpa"],
      timestamps: [0.1, 0.3],
    };
    expect(result.keyword).toBe("hey sherpa");
  });

  it("DiarizationSegment has start, end, speaker", () => {
    const seg: DiarizationSegment = { start: 0.0, end: 2.5, speaker: 0 };
    expect(seg.speaker).toBe(0);
  });

  it("AudioEvent has name, index, prob", () => {
    const event: AudioEvent = { name: "Speech", index: 0, prob: 0.95 };
    expect(event.prob).toBeGreaterThan(0);
  });

  it("DenoisedAudio has samples and sampleRate", () => {
    const audio: DenoisedAudio = { samples: [0.01, -0.01], sampleRate: 16000 };
    expect(audio.sampleRate).toBe(16000);
  });
});

describe("Detection types", () => {
  it("DetectedSttModel has type and files", () => {
    const detected: DetectedSttModel = {
      type: "whisper",
      files: { encoder: "encoder.onnx", decoder: "decoder.onnx" },
      tokensPath: "tokens.txt",
    };
    expect(detected.type).toBe("whisper");
    expect(detected.files.encoder).toBe("encoder.onnx");
  });

  it("DetectedTtsModel has type and files", () => {
    const detected: DetectedTtsModel = {
      type: "vits",
      files: { model: "model.onnx" },
    };
    expect(detected.type).toBe("vits");
  });
});
