/// <reference types="jest" />
import { detectSttModel, detectTtsModel } from "../modelDetection";
import * as utils from "../utils";

jest.mock("../utils", () => ({
  ...jest.requireActual("../utils"),
  listModelsAtPath: jest.fn(),
}));

const mockListModels = utils.listModelsAtPath as jest.MockedFunction<
  typeof utils.listModelsAtPath
>;

beforeEach(() => {
  mockListModels.mockReset();
});

// =============================================================================
// STT Detection
// =============================================================================

describe("detectSttModel", () => {
  it("detects transducer (encoder + decoder + joiner)", async () => {
    mockListModels.mockResolvedValue([
      "encoder-epoch-99.onnx",
      "decoder-epoch-99.onnx",
      "joiner-epoch-99.onnx",
      "tokens.txt",
    ]);

    const result = await detectSttModel("/models/transducer");
    expect(result.type).toBe("transducer");
    expect(result.files.encoder).toBeDefined();
    expect(result.files.decoder).toBeDefined();
    expect(result.files.joiner).toBeDefined();
    expect(result.tokensPath).toBe("tokens.txt");
  });

  it("detects whisper (encoder + decoder, no joiner)", async () => {
    mockListModels.mockResolvedValue([
      "whisper-encoder.onnx",
      "whisper-decoder.onnx",
      "tokens.txt",
    ]);

    const result = await detectSttModel("/models/whisper-tiny");
    expect(result.type).toBe("whisper");
    expect(result.files.encoder).toBeDefined();
    expect(result.files.decoder).toBeDefined();
  });

  it("detects canary via directory hint", async () => {
    mockListModels.mockResolvedValue([
      "encoder.onnx",
      "decoder.onnx",
      "tokens.txt",
    ]);

    const result = await detectSttModel("/models/canary-1b");
    expect(result.type).toBe("canary");
  });

  it("detects moonshine (preprocess + encoder + uncached/cached)", async () => {
    mockListModels.mockResolvedValue([
      "preprocess.onnx",
      "encoder.onnx",
      "uncached_decoder.onnx",
      "cached_decoder.onnx",
      "tokens.txt",
    ]);

    const result = await detectSttModel("/models/moonshine");
    expect(result.type).toBe("moonshine");
    expect(result.files.preprocessor).toBeDefined();
    expect(result.files.encoder).toBeDefined();
  });

  it("detects funasr_nano (encoder_adaptor + llm + embedding)", async () => {
    mockListModels.mockResolvedValue([
      "encoder_adaptor.onnx",
      "llm.onnx",
      "embedding.onnx",
      "vocab.json",
      "tokens.txt",
    ]);

    const result = await detectSttModel("/models/funasr-nano");
    expect(result.type).toBe("funasr_nano");
    expect(result.files.encoderAdaptor).toBeDefined();
    expect(result.files.llm).toBeDefined();
    expect(result.files.embedding).toBeDefined();
  });

  it("detects sensevoice via directory hint", async () => {
    mockListModels.mockResolvedValue(["model.onnx", "tokens.txt"]);

    const result = await detectSttModel("/models/sensevoice-small");
    expect(result.type).toBe("sense_voice");
  });

  it("detects nemo_ctc via directory hint", async () => {
    mockListModels.mockResolvedValue(["model.onnx", "tokens.txt"]);

    const result = await detectSttModel("/models/nemo-ctc-conformer");
    expect(result.type).toBe("nemo_ctc");
  });

  it("detects paraformer via directory hint", async () => {
    mockListModels.mockResolvedValue(["model.onnx", "tokens.txt"]);

    const result = await detectSttModel("/models/paraformer-zh");
    expect(result.type).toBe("paraformer");
  });

  it("detects fire_red_asr via encoder+decoder and hint", async () => {
    mockListModels.mockResolvedValue([
      "encoder.onnx",
      "decoder.onnx",
      "tokens.txt",
    ]);

    const result = await detectSttModel("/models/fire-red-asr");
    expect(result.type).toBe("fire_red_asr");
  });

  it("returns auto when no files match", async () => {
    mockListModels.mockResolvedValue([]);
    const result = await detectSttModel("/empty");
    expect(result.type).toBe("auto");
  });

  it("detects nemo_transducer via hint", async () => {
    mockListModels.mockResolvedValue([
      "encoder.onnx",
      "decoder.onnx",
      "joiner.onnx",
      "tokens.txt",
    ]);

    const result = await detectSttModel("/models/nemo-transducer");
    expect(result.type).toBe("nemo_transducer");
  });
});

// =============================================================================
// TTS Detection
// =============================================================================

describe("detectTtsModel", () => {
  it("detects vits (single model.onnx)", async () => {
    mockListModels.mockResolvedValue(["model.onnx", "tokens.txt"]);

    const result = await detectTtsModel("/models/vits-en");
    expect(result.type).toBe("vits");
    expect(result.files.model).toBeDefined();
    expect(result.files.lexicon).toBeUndefined();
  });

  it("detects vits with lexicon", async () => {
    mockListModels.mockResolvedValue([
      "vits-vctk.int8.onnx",
      "vits-vctk.onnx",
      "tokens.txt",
      "lexicon.txt",
    ]);

    const result = await detectTtsModel("/models/vits-vctk");
    expect(result.type).toBe("vits");
    expect(result.files.model).toBeDefined();
    expect(result.files.lexicon).toBe("lexicon.txt");
    expect(result.tokensPath).toBe("tokens.txt");
  });

  it("detects kokoro (voices.bin present)", async () => {
    mockListModels.mockResolvedValue([
      "model.onnx",
      "voices.bin",
      "tokens.txt",
      "espeak-ng-data/en_dict",
    ]);

    const result = await detectTtsModel("/models/kokoro-en");
    expect(result.type).toBe("kokoro");
    expect(result.files.voices).toBeDefined();
  });

  it("detects kitten via hint + voices.bin", async () => {
    mockListModels.mockResolvedValue([
      "model.onnx",
      "voices.bin",
      "tokens.txt",
    ]);

    const result = await detectTtsModel("/models/kitten-en");
    expect(result.type).toBe("kitten");
  });

  it("detects matcha (acoustic_model + vocoder)", async () => {
    mockListModels.mockResolvedValue([
      "acoustic_model.onnx",
      "vocoder.onnx",
      "tokens.txt",
      "lexicon.txt",
    ]);

    const result = await detectTtsModel("/models/matcha-en");
    expect(result.type).toBe("matcha");
    expect(result.files.acousticModel).toBeDefined();
    expect(result.files.vocoder).toBeDefined();
  });

  it("detects pocket (lm_flow + lm_main)", async () => {
    mockListModels.mockResolvedValue([
      "lm_flow.onnx",
      "lm_main.onnx",
      "encoder.onnx",
      "decoder.onnx",
      "text_conditioner.onnx",
      "vocab.json",
      "token_scores.json",
    ]);

    const result = await detectTtsModel("/models/pocket-tts");
    expect(result.type).toBe("pocket");
    expect(result.files.lmFlow).toBeDefined();
    expect(result.files.lmMain).toBeDefined();
  });

  it("detects zipvoice (encoder + decoder + vocoder)", async () => {
    mockListModels.mockResolvedValue([
      "encoder.onnx",
      "decoder.onnx",
      "vocoder.onnx",
      "tokens.txt",
    ]);

    const result = await detectTtsModel("/models/zipvoice");
    expect(result.type).toBe("zipvoice");
  });

  it("detects supertonic (duration_predictor + text_encoder + vector_estimator + vocoder)", async () => {
    mockListModels.mockResolvedValue([
      "duration_predictor.onnx",
      "text_encoder.onnx",
      "vector_estimator.onnx",
      "vocoder.onnx",
      "tts.json",
      "tokens.txt",
    ]);

    const result = await detectTtsModel("/models/supertonic");
    expect(result.type).toBe("supertonic");
  });

  it("returns auto when no files match", async () => {
    mockListModels.mockResolvedValue([]);
    const result = await detectTtsModel("/empty");
    expect(result.type).toBe("auto");
  });
});
