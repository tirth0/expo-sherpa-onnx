import type {
  DetectedSttModel,
  DetectedTtsModel,
  SttModelType,
  TtsModelType,
} from "./ExpoSherpaOnnx.types";
import { listModelsAtPath } from "./utils";

function findFirst(files: string[], pattern: RegExp): string | undefined {
  return files.find((f) => pattern.test(f));
}

function onnxFiles(files: string[]): string[] {
  return files.filter((f) => f.endsWith(".onnx"));
}

function dirNameHint(modelPath: string): string {
  const parts = modelPath.replace(/\/+$/, "").split("/");
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

export async function detectSttModel(
  modelPath: string
): Promise<DetectedSttModel> {
  const allFiles = await listModelsAtPath(modelPath, true);
  const onnx = onnxFiles(allFiles);
  const hint = dirNameHint(modelPath);

  const tokens = findFirst(allFiles, /\btokens\.txt$/i);
  const encoder = findFirst(onnx, /encoder/i);
  const decoder = findFirst(onnx, /decoder/i);
  const joiner = findFirst(onnx, /joiner/i);

  // Moonshine: preprocess + encoder + uncached/cached/merged decoder
  const preprocess = findFirst(onnx, /preprocess/i);
  const uncachedDecoder = findFirst(onnx, /uncached.?dec/i);
  const cachedDecoder = findFirst(onnx, /cached.?dec/i);
  const mergedDecoder = findFirst(onnx, /merged.?dec/i);

  if (preprocess && encoder && (uncachedDecoder || mergedDecoder)) {
    return {
      type: "moonshine",
      files: {
        ...(preprocess && { preprocessor: preprocess }),
        ...(encoder && { encoder }),
        ...(uncachedDecoder && { uncachedDecoder }),
        ...(cachedDecoder && { cachedDecoder }),
        ...(mergedDecoder && { mergedDecoder }),
      },
      tokensPath: tokens,
    };
  }

  // FunASR Nano: encoder_adaptor + llm + embedding + vocab.json
  const encoderAdaptor = findFirst(onnx, /encoder.?adaptor/i);
  const llm = findFirst(onnx, /\bllm/i);
  const embedding = findFirst(onnx, /\bembedding/i);
  const vocabJson = findFirst(allFiles, /\bvocab\.json$/i);

  if (encoderAdaptor && llm && embedding) {
    return {
      type: "funasr_nano",
      files: {
        encoderAdaptor,
        llm,
        embedding,
        ...(vocabJson && { tokenizer: vocabJson }),
      },
      tokensPath: tokens,
    };
  }

  // Transducer: encoder + decoder + joiner
  if (encoder && decoder && joiner) {
    let type: SttModelType = "transducer";
    if (hint.includes("nemo")) type = "nemo_transducer";
    return {
      type,
      files: { encoder, decoder, joiner },
      tokensPath: tokens,
    };
  }

  // Whisper / Canary / FireRedAsr: encoder + decoder, no joiner
  if (encoder && decoder && !joiner) {
    let type: SttModelType = "whisper";
    if (hint.includes("canary")) type = "canary";
    else if (hint.includes("fire") && hint.includes("red"))
      type = "fire_red_asr";
    else if (hint.includes("whisper")) type = "whisper";
    return {
      type,
      files: { encoder, decoder },
      tokensPath: tokens,
    };
  }

  // Pocket / PocketTTS patterns (single model.onnx with tokens)
  const singleModel = findFirst(onnx, /\bmodel[^/]*\.onnx$/i);

  // SenseVoice: hint or specific naming
  if (hint.includes("sense") || hint.includes("sensevoice")) {
    return {
      type: "sense_voice",
      files: { model: singleModel ?? onnx[0] ?? "" },
      tokensPath: tokens,
    };
  }

  // CTC variants (single model + tokens)
  if (singleModel || onnx.length === 1) {
    const modelFile = singleModel ?? onnx[0] ?? "";
    let type: SttModelType = "zipformer_ctc";

    if (hint.includes("nemo")) type = "nemo_ctc";
    else if (hint.includes("wenet")) type = "wenet_ctc";
    else if (hint.includes("dolphin")) type = "dolphin";
    else if (hint.includes("omnilingual")) type = "omnilingual";
    else if (hint.includes("medasr") || hint.includes("med_asr"))
      type = "medasr";
    else if (hint.includes("telespeech")) type = "telespeech_ctc";
    else if (hint.includes("paraformer")) type = "paraformer";
    else if (hint.includes("tone")) type = "tone_ctc";
    else if (hint.includes("fire") && hint.includes("red"))
      type = "fire_red_asr";
    else if (hint.includes("zipformer")) type = "zipformer_ctc";

    return {
      type,
      files: { model: modelFile },
      tokensPath: tokens,
    };
  }

  return {
    type: "auto",
    files: {},
    tokensPath: tokens,
  };
}

export async function detectTtsModel(
  modelPath: string
): Promise<DetectedTtsModel> {
  const allFiles = await listModelsAtPath(modelPath, true);
  const onnx = onnxFiles(allFiles);
  const hint = dirNameHint(modelPath);

  const tokens = findFirst(allFiles, /\btokens\.txt$/i);

  // Pocket: lm_flow + lm_main + encoder + decoder + text_conditioner + vocab.json + token_scores.json
  const lmFlow = findFirst(onnx, /lm.?flow/i);
  const lmMain = findFirst(onnx, /lm.?main/i);
  const textConditioner = findFirst(onnx, /text.?conditioner/i);
  const vocabJson = findFirst(allFiles, /\bvocab\.json$/i);
  const tokenScoresJson = findFirst(allFiles, /\btoken.?scores\.json$/i);

  if (lmFlow && lmMain) {
    const encoder = findFirst(onnx, /encoder/i);
    const decoder = findFirst(onnx, /decoder/i);
    return {
      type: "pocket",
      files: {
        lmFlow,
        lmMain,
        ...(encoder && { encoder }),
        ...(decoder && { decoder }),
        ...(textConditioner && { textConditioner }),
        ...(vocabJson && { vocabJson }),
        ...(tokenScoresJson && { tokenScoresJson }),
      },
      tokensPath: tokens,
    };
  }

  // ZipVoice: encoder + decoder + vocoder (3 separate onnx)
  const encoder = findFirst(onnx, /encoder/i);
  const decoder = findFirst(onnx, /decoder/i);
  const vocoder = findFirst(onnx, /vocoder/i);

  if (encoder && decoder && vocoder) {
    return {
      type: "zipvoice",
      files: { encoder, decoder, vocoder },
      tokensPath: tokens,
    };
  }

  // Kokoro / Kitten: voices.bin + espeak-ng-data/
  const voicesBin = findFirst(allFiles, /\bvoices\.bin$/i);
  const espeakData = findFirst(allFiles, /espeak-ng-data/i);

  if (voicesBin) {
    const type: TtsModelType = hint.includes("kitten") ? "kitten" : "kokoro";
    const model = findFirst(onnx, /model/i) ?? onnx[0] ?? "";
    return {
      type,
      files: {
        model,
        voices: voicesBin,
        ...(espeakData && { dataDir: espeakData.replace(/\/[^/]+$/, "") }),
      },
      tokensPath: tokens,
    };
  }

  // Supertonic: duration_predictor + text_encoder + vector_estimator + vocoder + tts.json
  const durationPredictor = findFirst(onnx, /duration.?predictor/i);
  const textEncoder = findFirst(onnx, /text.?encoder/i);
  const vectorEstimator = findFirst(onnx, /vector.?estimator/i);
  const ttsJson = findFirst(allFiles, /\btts\.json$/i);

  if (durationPredictor && textEncoder && vectorEstimator && vocoder) {
    return {
      type: "supertonic",
      files: {
        durationPredictor,
        textEncoder,
        vectorEstimator,
        vocoder,
        ...(ttsJson && { ttsJson }),
      },
      tokensPath: tokens,
    };
  }

  // Matcha: acoustic_model + vocoder
  const acousticModel = findFirst(onnx, /acoustic.?model/i);

  if (acousticModel && vocoder) {
    return {
      type: "matcha",
      files: { acousticModel, vocoder },
      tokensPath: tokens,
    };
  }

  // Matcha by hint (model.onnx + tokens.txt when folder name says matcha)
  if (hint.includes("matcha") && vocoder) {
    const model = findFirst(onnx, /model/i) ?? onnx[0] ?? "";
    return {
      type: "matcha",
      files: { acousticModel: model, vocoder },
      tokensPath: tokens,
    };
  }

  // VITS: single model.onnx (default fallback for TTS)
  const singleModel = findFirst(onnx, /model/i) ?? onnx[0];
  if (singleModel) {
    const lexicon = findFirst(allFiles, /\blexicon\.txt$/i);
    return {
      type: "vits",
      files: { model: singleModel, ...(lexicon && { lexicon }) },
      tokensPath: tokens,
    };
  }

  return {
    type: "auto",
    files: {},
    tokensPath: tokens,
  };
}
