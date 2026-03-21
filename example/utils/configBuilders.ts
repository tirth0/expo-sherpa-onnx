import type {
  DetectedSttModel,
  DetectedTtsModel,
  OfflineRecognizerConfig,
  OnlineRecognizerConfig,
  OfflineTtsConfig,
} from 'expo-sherpa-onnx';

export function buildOfflineConfigFromDetection(detected: DetectedSttModel, modelDir: string): OfflineRecognizerConfig {
  const tokensPath = detected.tokensPath ? `${modelDir}/${detected.tokensPath}` : `${modelDir}/tokens.txt`;
  const f = (key: string) => detected.files[key] ? `${modelDir}/${detected.files[key]}` : '';
  const base: OfflineRecognizerConfig = {
    modelConfig: { tokens: tokensPath, numThreads: 2, debug: false, modelType: '' },
  };
  switch (detected.type) {
    case 'whisper':
      base.modelConfig!.whisper = { encoder: f('encoder'), decoder: f('decoder') };
      break;
    case 'paraformer':
      base.modelConfig!.paraformer = { model: f('model') };
      break;
    case 'sense_voice':
      base.modelConfig!.senseVoice = { model: f('model') };
      break;
    case 'transducer':
    case 'nemo_transducer':
      base.modelConfig!.transducer = { encoder: f('encoder'), decoder: f('decoder'), joiner: f('joiner') };
      break;
    case 'nemo_ctc':
      base.modelConfig!.nemoEncDecCtc = { model: f('model') };
      break;
    case 'moonshine':
      base.modelConfig!.moonshine = { preprocessor: f('preprocessor'), encoder: f('encoder'), uncachedDecoder: f('uncachedDecoder'), cachedDecoder: f('cachedDecoder') };
      break;
  }
  return base;
}

export function buildOnlineConfigFromDetection(detected: DetectedSttModel, modelDir: string): OnlineRecognizerConfig {
  const tokensPath = detected.tokensPath ? `${modelDir}/${detected.tokensPath}` : `${modelDir}/tokens.txt`;
  const f = (key: string) => detected.files[key] ? `${modelDir}/${detected.files[key]}` : '';
  const base: OnlineRecognizerConfig = {
    modelConfig: { tokens: tokensPath, numThreads: 2, debug: false, modelType: '' },
    enableEndpoint: true,
  };
  if (detected.type === 'transducer' || detected.type === 'nemo_transducer') {
    base.modelConfig!.transducer = { encoder: f('encoder'), decoder: f('decoder'), joiner: f('joiner') };
  } else if (detected.type === 'paraformer') {
    base.modelConfig!.paraformer = { encoder: f('encoder'), decoder: f('decoder') };
  }
  return base;
}

export function buildTtsConfigFromDetection(detected: DetectedTtsModel, modelDir: string): OfflineTtsConfig {
  const tokensPath = detected.tokensPath ? `${modelDir}/${detected.tokensPath}` : `${modelDir}/tokens.txt`;
  const f = (key: string) => detected.files[key] ? `${modelDir}/${detected.files[key]}` : '';

  const base: OfflineTtsConfig = {
    model: { numThreads: 2, debug: false, provider: 'cpu' },
    maxNumSentences: 1,
  };

  switch (detected.type) {
    case 'vits':
      base.model!.vits = {
        model: f('model'),
        tokens: tokensPath,
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
      };
      break;
    case 'matcha':
      base.model!.matcha = {
        acousticModel: f('acousticModel'),
        vocoder: f('vocoder'),
        tokens: tokensPath,
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
      };
      break;
    case 'kokoro':
      base.model!.kokoro = {
        model: f('model'),
        voices: f('voices'),
        tokens: tokensPath,
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
      };
      break;
    case 'kitten':
      base.model!.kitten = {
        model: f('model'),
        voices: f('voices'),
        tokens: tokensPath,
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
      };
      break;
    case 'zipvoice':
      base.model!.zipvoice = {
        encoder: f('encoder'),
        decoder: f('decoder'),
        vocoder: f('vocoder'),
        tokens: tokensPath,
        dataDir: detected.files['dataDir'] ? f('dataDir') : '',
        lexicon: detected.files['lexicon'] ? f('lexicon') : '',
      };
      break;
    case 'pocket':
      base.model!.pocket = {
        lmFlow: f('lmFlow'),
        lmMain: f('lmMain'),
        encoder: f('encoder'),
        decoder: f('decoder'),
        textConditioner: f('textConditioner'),
        vocabJson: f('vocabJson'),
        tokenScoresJson: f('tokenScoresJson'),
      };
      break;
    case 'supertonic':
      base.model!.supertonic = {
        durationPredictor: f('durationPredictor'),
        textEncoder: f('textEncoder'),
        vectorEstimator: f('vectorEstimator'),
        vocoder: f('vocoder'),
        ttsJson: f('ttsJson'),
        unicodeIndexer: f('unicodeIndexer'),
        voiceStyle: f('voiceStyle'),
      };
      break;
  }
  return base;
}
