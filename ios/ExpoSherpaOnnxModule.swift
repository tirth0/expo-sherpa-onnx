import ExpoModulesCore
import csherpa

private class TtsStreamingContext {
  let module: ExpoSherpaOnnxModule
  let requestId: String

  init(module: ExpoSherpaOnnxModule, requestId: String) {
    self.module = module
    self.requestId = requestId
  }
}

public class ExpoSherpaOnnxModule: Module {
  private var handleCounter = 0
  private let lock = NSLock()
  private var offlineRecognizers: [Int: SherpaOnnxOfflineRecognizer] = [:]
  private var onlineRecognizers: [Int: SherpaOnnxRecognizer] = [:]
  private var offlineTtsEngines: [Int: SherpaOnnxOfflineTtsWrapper] = [:]
  private var vadEngines: [Int: SherpaOnnxVoiceActivityDetectorWrapper] = [:]
  private var kwsSpotters: [Int: SherpaOnnxKeywordSpotterWrapper] = [:]

  private func nextHandle() -> Int {
    lock.lock()
    defer { lock.unlock() }
    handleCounter += 1
    return handleCounter
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoSherpaOnnx")

    OnDestroy {
      self.offlineRecognizers.removeAll()
      self.onlineRecognizers.removeAll()
      self.offlineTtsEngines.removeAll()
      self.vadEngines.removeAll()
      self.kwsSpotters.removeAll()
    }

    // MARK: - Version Info

    Function("getVersion") {
      return getSherpaOnnxVersion()
    }

    Function("getGitSha1") {
      return getSherpaOnnxGitSha1()
    }

    Function("getGitDate") {
      return getSherpaOnnxGitDate()
    }

    Function("getVersionInfo") {
      return [
        "version": getSherpaOnnxVersion(),
        "gitSha1": getSherpaOnnxGitSha1(),
        "gitDate": getSherpaOnnxGitDate(),
      ]
    }

    // MARK: - App Paths

    Function("getAppPaths") {
      let docsDir = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first!
      let cacheDir = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true).first!
      let modelsDir = (docsDir as NSString).appendingPathComponent("models")

      let fm = FileManager.default
      if !fm.fileExists(atPath: modelsDir) {
        try? fm.createDirectory(atPath: modelsDir, withIntermediateDirectories: true)
      }

      return [
        "documentsDir": docsDir,
        "cacheDir": cacheDir,
        "modelsDir": modelsDir,
      ]
    }

    // MARK: - Model Path Helpers

    AsyncFunction("resolveModelPath") { (config: [String: String]) -> String in
      guard let type = config["type"], let path = config["path"] else {
        throw ModelPathError.invalidConfig
      }

      switch type {
      case "asset":
        return try Self.resolveAssetPath(path)
      case "file":
        return try Self.resolveFilePath(path)
      case "auto":
        if let assetPath = try? Self.resolveAssetPath(path) {
          return assetPath
        }
        return try Self.resolveFilePath(path)
      default:
        throw ModelPathError.unknownType(type)
      }
    }

    AsyncFunction("listModelsAtPath") { (path: String, recursive: Bool) -> [String] in
      let fm = FileManager.default

      let resolvedPath: String
      if fm.fileExists(atPath: path) {
        resolvedPath = path
      } else if let bundlePath = Bundle.main.path(forResource: path, ofType: nil) {
        resolvedPath = bundlePath
      } else {
        let docsDir = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first!
        let docsPath = (docsDir as NSString).appendingPathComponent(path)
        if fm.fileExists(atPath: docsPath) {
          resolvedPath = docsPath
        } else {
          throw ModelPathError.pathNotFound(path)
        }
      }

      if recursive {
        guard let enumerator = fm.enumerator(atPath: resolvedPath) else {
          return []
        }
        var results: [String] = []
        while let element = enumerator.nextObject() as? String {
          results.append(element)
        }
        return results
      } else {
        return try fm.contentsOfDirectory(atPath: resolvedPath)
      }
    }

    // MARK: - Offline ASR

    AsyncFunction("createOfflineRecognizer") { (config: [String: Any]) -> Int in
      var recognizerConfig = Self.buildOfflineRecognizerConfig(config)
      guard let recognizer = SherpaOnnxOfflineRecognizer(config: &recognizerConfig) else {
        throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create offline recognizer. Model loading failed. Check that model files exist and paths are correct."])
      }
      let handle = self.nextHandle()
      self.lock.lock()
      self.offlineRecognizers[handle] = recognizer
      self.lock.unlock()
      return handle
    }

    AsyncFunction("offlineRecognizerDecode") { (handle: Int, samples: [Double], sampleRate: Int) -> [String: Any] in
      guard let recognizer = self.offlineRecognizers[handle] else {
        throw SherpaError.invalidHandle("offline recognizer", handle)
      }
      let floatSamples = samples.map { Float($0) }
      let result = recognizer.decode(samples: floatSamples, sampleRate: sampleRate)
      return [
        "text": result.text,
        "tokens": [] as [String],
        "timestamps": result.timestamps,
        "lang": result.lang,
        "emotion": result.emotion,
        "event": result.event,
        "durations": result.durations,
      ]
    }

    AsyncFunction("offlineRecognizerDecodeFile") { (handle: Int, filePath: String) -> [String: Any] in
      guard let recognizer = self.offlineRecognizers[handle] else {
        throw SherpaError.invalidHandle("offline recognizer", handle)
      }
      let wave = SherpaOnnxWaveWrapper.readWave(filename: filePath)
      guard wave.wave != nil else {
        throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to read wave file: \(filePath)"])
      }
      let result = recognizer.decode(samples: wave.samples, sampleRate: wave.sampleRate)
      return [
        "text": result.text,
        "tokens": [] as [String],
        "timestamps": result.timestamps,
        "lang": result.lang,
        "emotion": result.emotion,
        "event": result.event,
        "durations": result.durations,
      ]
    }

    AsyncFunction("destroyOfflineRecognizer") { (handle: Int) in
      self.lock.lock()
      guard self.offlineRecognizers.removeValue(forKey: handle) != nil else {
        self.lock.unlock()
        throw SherpaError.invalidHandle("offline recognizer", handle)
      }
      self.lock.unlock()
    }

    // MARK: - Online (Streaming) ASR

    AsyncFunction("createOnlineRecognizer") { (config: [String: Any]) -> Int in
      var recognizerConfig = Self.buildOnlineRecognizerConfig(config)
      guard let recognizer = SherpaOnnxRecognizer(config: &recognizerConfig) else {
        throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create online recognizer. Model loading failed. Check that model files exist and paths are correct."])
      }
      let handle = self.nextHandle()
      self.lock.lock()
      self.onlineRecognizers[handle] = recognizer
      self.lock.unlock()
      return handle
    }

    AsyncFunction("createOnlineStream") { (recognizerHandle: Int, hotwords: String) -> Int in
      // The SherpaOnnxRecognizer owns its stream internally; we return the same handle
      // and use it as both recognizer and stream handle for the iOS implementation.
      guard self.onlineRecognizers[recognizerHandle] != nil else {
        throw SherpaError.invalidHandle("online recognizer", recognizerHandle)
      }
      if !hotwords.isEmpty {
        self.onlineRecognizers[recognizerHandle]?.reset(hotwords: hotwords)
      }
      return recognizerHandle
    }

    AsyncFunction("onlineStreamAcceptWaveform") { (streamHandle: Int, samples: [Double], sampleRate: Int) in
      guard let recognizer = self.onlineRecognizers[streamHandle] else {
        throw SherpaError.invalidHandle("online stream", streamHandle)
      }
      let floatSamples = samples.map { Float($0) }
      recognizer.acceptWaveform(samples: floatSamples, sampleRate: sampleRate)
    }

    AsyncFunction("onlineStreamInputFinished") { (streamHandle: Int) in
      guard let recognizer = self.onlineRecognizers[streamHandle] else {
        throw SherpaError.invalidHandle("online stream", streamHandle)
      }
      recognizer.inputFinished()
    }

    AsyncFunction("onlineRecognizerDecode") { (recognizerHandle: Int, _streamHandle: Int) in
      guard let recognizer = self.onlineRecognizers[recognizerHandle] else {
        throw SherpaError.invalidHandle("online recognizer", recognizerHandle)
      }
      recognizer.decode()
    }

    AsyncFunction("onlineRecognizerIsReady") { (recognizerHandle: Int, _streamHandle: Int) -> Bool in
      guard let recognizer = self.onlineRecognizers[recognizerHandle] else {
        throw SherpaError.invalidHandle("online recognizer", recognizerHandle)
      }
      return recognizer.isReady()
    }

    AsyncFunction("onlineRecognizerIsEndpoint") { (recognizerHandle: Int, _streamHandle: Int) -> Bool in
      guard let recognizer = self.onlineRecognizers[recognizerHandle] else {
        throw SherpaError.invalidHandle("online recognizer", recognizerHandle)
      }
      return recognizer.isEndpoint()
    }

    AsyncFunction("onlineRecognizerGetResult") { (recognizerHandle: Int, _streamHandle: Int) -> [String: Any] in
      guard let recognizer = self.onlineRecognizers[recognizerHandle] else {
        throw SherpaError.invalidHandle("online recognizer", recognizerHandle)
      }
      let result = recognizer.getResult()
      return [
        "text": result.text,
        "tokens": result.tokens,
        "timestamps": result.timestamps,
      ]
    }

    AsyncFunction("onlineRecognizerReset") { (recognizerHandle: Int, _streamHandle: Int) in
      guard let recognizer = self.onlineRecognizers[recognizerHandle] else {
        throw SherpaError.invalidHandle("online recognizer", recognizerHandle)
      }
      recognizer.reset()
    }

    AsyncFunction("destroyOnlineStream") { (_streamHandle: Int) in
      // On iOS the stream is owned by the recognizer; no-op here
    }

    AsyncFunction("destroyOnlineRecognizer") { (recognizerHandle: Int) in
      self.lock.lock()
      guard self.onlineRecognizers.removeValue(forKey: recognizerHandle) != nil else {
        self.lock.unlock()
        throw SherpaError.invalidHandle("online recognizer", recognizerHandle)
      }
      self.lock.unlock()
    }

    // MARK: - Wave Reading

    AsyncFunction("readWaveFile") { (filePath: String) -> [String: Any] in
      let wave = SherpaOnnxWaveWrapper.readWave(filename: filePath)
      guard wave.wave != nil else {
        throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to read wave file: \(filePath)"])
      }
      return [
        "samples": wave.samples,
        "sampleRate": wave.sampleRate,
      ]
    }

    // MARK: - Hardware Acceleration Detection

    Function("getAvailableProviders") { () -> [String] in
      var providers = ["cpu"]
      #if canImport(CoreML)
      providers.append("coreml")
      #endif
      return providers
    }

    Events("ttsChunk", "ttsComplete", "ttsError")

    // =========================================================================
    // Offline TTS
    // =========================================================================

    AsyncFunction("createOfflineTts") { (config: [String: Any]) -> [String: Any] in
      try Self.validateTtsConfig(config)
      var ttsConfig = Self.buildOfflineTtsConfig(config)
      guard let tts = SherpaOnnxOfflineTtsWrapper(config: &ttsConfig) else {
        throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create TTS engine. Check model files and paths."])
      }
      let handle = self.nextHandle()
      self.lock.lock()
      self.offlineTtsEngines[handle] = tts
      self.lock.unlock()

      let sampleRate = SherpaOnnxOfflineTtsSampleRate(tts.tts)
      let numSpeakers = SherpaOnnxOfflineTtsNumSpeakers(tts.tts)

      return [
        "handle": handle,
        "sampleRate": sampleRate,
        "numSpeakers": numSpeakers,
      ]
    }

    AsyncFunction("offlineTtsGenerate") { (handle: Int, text: String, sid: Int, speed: Double) -> [String: Any] in
      guard let tts = self.offlineTtsEngines[handle] else {
        throw SherpaError.invalidHandle("TTS engine", handle)
      }
      let audio = tts.generate(text: text, sid: sid, speed: Float(speed))
      return [
        "samples": audio.samples.map { Double($0) },
        "sampleRate": Int(audio.sampleRate),
      ]
    }

    AsyncFunction("offlineTtsSampleRate") { (handle: Int) -> Int in
      guard let tts = self.offlineTtsEngines[handle] else {
        throw SherpaError.invalidHandle("TTS engine", handle)
      }
      return Int(SherpaOnnxOfflineTtsSampleRate(tts.tts))
    }

    AsyncFunction("offlineTtsNumSpeakers") { (handle: Int) -> Int in
      guard let tts = self.offlineTtsEngines[handle] else {
        throw SherpaError.invalidHandle("TTS engine", handle)
      }
      return Int(SherpaOnnxOfflineTtsNumSpeakers(tts.tts))
    }

    AsyncFunction("destroyOfflineTts") { (handle: Int) in
      self.lock.lock()
      self.offlineTtsEngines.removeValue(forKey: handle)
      self.lock.unlock()
    }

    AsyncFunction("offlineTtsGenerateStreaming") { (handle: Int, text: String, sid: Int, speed: Double, requestId: String) in
      guard let tts = self.offlineTtsEngines[handle] else {
        throw SherpaError.invalidHandle("TTS engine", handle)
      }

      let context = TtsStreamingContext(module: self, requestId: requestId)
      let contextPtr = Unmanaged.passRetained(context).toOpaque()

      let callback: TtsCallbackWithArg = { samplesPtr, n, arg in
        guard let arg = arg, let samplesPtr = samplesPtr, n > 0 else { return 0 }
        let ctx = Unmanaged<TtsStreamingContext>.fromOpaque(arg).takeUnretainedValue()
        let buffer = UnsafeBufferPointer(start: samplesPtr, count: Int(n))
        let array = Array(buffer).map { Double($0) }
        ctx.module.sendEvent("ttsChunk", [
          "requestId": ctx.requestId,
          "samples": array,
        ])
        return 0
      }

      let audio = tts.generateWithCallbackWithArg(
        text: text,
        callback: callback,
        arg: contextPtr,
        sid: sid,
        speed: Float(speed)
      )
      self.sendEvent("ttsComplete", [
        "requestId": requestId,
        "sampleRate": Int(audio.sampleRate),
      ])

      Unmanaged<TtsStreamingContext>.fromOpaque(contextPtr).release()
    }

    // =========================================================================
    // Voice Activity Detection (VAD)
    // =========================================================================

    AsyncFunction("createVad") { (config: [String: Any], bufferSizeInSeconds: Double) -> Int in
      var vadConfig = Self.buildVadModelConfig(config)
      let vad = SherpaOnnxVoiceActivityDetectorWrapper(
        config: &vadConfig,
        buffer_size_in_seconds: Float(bufferSizeInSeconds)
      )
      let handle = self.nextHandle()
      self.lock.lock()
      self.vadEngines[handle] = vad
      self.lock.unlock()
      return handle
    }

    AsyncFunction("vadAcceptWaveform") { (handle: Int, samples: [Double]) in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      let floatSamples = samples.map { Float($0) }
      vad.acceptWaveform(samples: floatSamples)
    }

    AsyncFunction("vadEmpty") { (handle: Int) -> Bool in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      return vad.isEmpty()
    }

    AsyncFunction("vadIsSpeechDetected") { (handle: Int) -> Bool in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      return vad.isSpeechDetected()
    }

    AsyncFunction("vadPop") { (handle: Int) in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      vad.pop()
    }

    AsyncFunction("vadFront") { (handle: Int) -> [String: Any] in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      let segment = vad.front()
      return [
        "start": segment.start,
        "samples": segment.samples.map { Double($0) },
      ]
    }

    AsyncFunction("vadClear") { (handle: Int) in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      vad.clear()
    }

    AsyncFunction("vadReset") { (handle: Int) in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      vad.reset()
    }

    AsyncFunction("vadFlush") { (handle: Int) in
      guard let vad = self.vadEngines[handle] else {
        throw SherpaError.invalidHandle("VAD", handle)
      }
      vad.flush()
    }

    AsyncFunction("destroyVad") { (handle: Int) in
      self.lock.lock()
      self.vadEngines.removeValue(forKey: handle)
      self.lock.unlock()
    }

    // =========================================================================
    // Keyword Spotting
    // =========================================================================

    AsyncFunction("createKeywordSpotter") { (config: [String: Any]) -> Int in
      var kwsConfig = Self.buildKeywordSpotterConfig(config)
      let spotter = SherpaOnnxKeywordSpotterWrapper(config: &kwsConfig)
      let handle = self.nextHandle()
      self.lock.lock()
      self.kwsSpotters[handle] = spotter
      self.lock.unlock()
      return handle
    }

    AsyncFunction("createKeywordStream") { (spotterHandle: Int, keywords: String) -> Int in
      // On iOS, the KWS wrapper owns a single stream internally.
      // We return the spotter handle as the stream handle.
      return spotterHandle
    }

    AsyncFunction("keywordStreamAcceptWaveform") { (streamHandle: Int, samples: [Double], sampleRate: Int) in
      guard let spotter = self.kwsSpotters[streamHandle] else {
        throw SherpaError.invalidHandle("KeywordSpotter stream", streamHandle)
      }
      let floatSamples = samples.map { Float($0) }
      spotter.acceptWaveform(samples: floatSamples, sampleRate: sampleRate)
    }

    AsyncFunction("keywordSpotterIsReady") { (spotterHandle: Int, streamHandle: Int) -> Bool in
      guard let spotter = self.kwsSpotters[spotterHandle] else {
        throw SherpaError.invalidHandle("KeywordSpotter", spotterHandle)
      }
      return spotter.isReady()
    }

    AsyncFunction("keywordSpotterDecode") { (spotterHandle: Int, streamHandle: Int) in
      guard let spotter = self.kwsSpotters[spotterHandle] else {
        throw SherpaError.invalidHandle("KeywordSpotter", spotterHandle)
      }
      spotter.decode()
    }

    AsyncFunction("keywordSpotterGetResult") { (spotterHandle: Int, streamHandle: Int) -> [String: Any] in
      guard let spotter = self.kwsSpotters[spotterHandle] else {
        throw SherpaError.invalidHandle("KeywordSpotter", spotterHandle)
      }
      let result = spotter.getResult()
      return [
        "keyword": result.keyword,
        "tokens": result.tokens,
        "timestamps": [] as [Double],
      ]
    }

    AsyncFunction("keywordSpotterReset") { (spotterHandle: Int, streamHandle: Int) in
      guard let spotter = self.kwsSpotters[spotterHandle] else {
        throw SherpaError.invalidHandle("KeywordSpotter", spotterHandle)
      }
      spotter.reset()
    }

    AsyncFunction("destroyKeywordStream") { (streamHandle: Int) in
      // No-op on iOS: stream is owned by the spotter wrapper
    }

    AsyncFunction("destroyKeywordSpotter") { (spotterHandle: Int) in
      self.lock.lock()
      self.kwsSpotters.removeValue(forKey: spotterHandle)
      self.lock.unlock()
    }
  }

  // MARK: - Path Resolution Helpers

  private static func resolveAssetPath(_ path: String) throws -> String {
    let fm = FileManager.default

    let docsDir = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first!
    let docsPath = (docsDir as NSString).appendingPathComponent("models/\(path)")
    if fm.fileExists(atPath: docsPath) {
      return docsPath
    }

    if let bundlePath = Bundle.main.path(forResource: path, ofType: nil) {
      return bundlePath
    }

    let resourcePath = Bundle.main.resourcePath ?? ""
    let fullResourcePath = (resourcePath as NSString).appendingPathComponent(path)
    if fm.fileExists(atPath: fullResourcePath) {
      return fullResourcePath
    }

    throw ModelPathError.assetNotFound(path)
  }

  private static func resolveFilePath(_ path: String) throws -> String {
    let fm = FileManager.default
    guard fm.fileExists(atPath: path) else {
      throw ModelPathError.fileNotFound(path)
    }
    return path
  }

  // MARK: - Config Builders

  private static func buildOfflineRecognizerConfig(_ config: [String: Any]) -> SherpaOnnxOfflineRecognizerConfig {
    let modelMap = config["modelConfig"] as? [String: Any] ?? [:]
    let featMap = config["featConfig"] as? [String: Any] ?? [:]

    let whisperMap = modelMap["whisper"] as? [String: Any] ?? [:]
    let transducerMap = modelMap["transducer"] as? [String: Any] ?? [:]
    let paraformerMap = modelMap["paraformer"] as? [String: Any] ?? [:]
    let nemoCtcMap = modelMap["nemoEncDecCtc"] as? [String: Any] ?? [:]
    let senseVoiceMap = modelMap["senseVoice"] as? [String: Any] ?? [:]
    let moonshineMap = modelMap["moonshine"] as? [String: Any] ?? [:]

    let featConfig = sherpaOnnxFeatureConfig(
      sampleRate: featMap["sampleRate"] as? Int ?? 16000,
      featureDim: featMap["featureDim"] as? Int ?? 80
    )

    let modelConfig = sherpaOnnxOfflineModelConfig(
      tokens: modelMap["tokens"] as? String ?? "",
      transducer: sherpaOnnxOfflineTransducerModelConfig(
        encoder: transducerMap["encoder"] as? String ?? "",
        decoder: transducerMap["decoder"] as? String ?? "",
        joiner: transducerMap["joiner"] as? String ?? ""
      ),
      paraformer: sherpaOnnxOfflineParaformerModelConfig(
        model: paraformerMap["model"] as? String ?? ""
      ),
      nemoCtc: sherpaOnnxOfflineNemoEncDecCtcModelConfig(
        model: nemoCtcMap["model"] as? String ?? ""
      ),
      whisper: sherpaOnnxOfflineWhisperModelConfig(
        encoder: whisperMap["encoder"] as? String ?? "",
        decoder: whisperMap["decoder"] as? String ?? "",
        language: whisperMap["language"] as? String ?? "",
        task: whisperMap["task"] as? String ?? "transcribe",
        tailPaddings: whisperMap["tailPaddings"] as? Int ?? -1
      ),
      numThreads: modelMap["numThreads"] as? Int ?? 1,
      provider: modelMap["provider"] as? String ?? "cpu",
      debug: (modelMap["debug"] as? Bool == true) ? 1 : 0,
      modelType: modelMap["modelType"] as? String ?? "",
      senseVoice: sherpaOnnxOfflineSenseVoiceModelConfig(
        model: senseVoiceMap["model"] as? String ?? "",
        language: senseVoiceMap["language"] as? String ?? ""
      ),
      moonshine: sherpaOnnxOfflineMoonshineModelConfig(
        preprocessor: moonshineMap["preprocessor"] as? String ?? "",
        encoder: moonshineMap["encoder"] as? String ?? "",
        uncachedDecoder: moonshineMap["uncachedDecoder"] as? String ?? "",
        cachedDecoder: moonshineMap["cachedDecoder"] as? String ?? ""
      )
    )

    return sherpaOnnxOfflineRecognizerConfig(
      featConfig: featConfig,
      modelConfig: modelConfig,
      decodingMethod: config["decodingMethod"] as? String ?? "greedy_search",
      maxActivePaths: config["maxActivePaths"] as? Int ?? 4,
      hotwordsFile: config["hotwordsFile"] as? String ?? "",
      hotwordsScore: (config["hotwordsScore"] as? NSNumber)?.floatValue ?? 1.5,
      ruleFsts: config["ruleFsts"] as? String ?? "",
      ruleFars: config["ruleFars"] as? String ?? "",
      blankPenalty: (config["blankPenalty"] as? NSNumber)?.floatValue ?? 0.0
    )
  }

  private static func buildOnlineRecognizerConfig(_ config: [String: Any]) -> SherpaOnnxOnlineRecognizerConfig {
    let modelMap = config["modelConfig"] as? [String: Any] ?? [:]
    let featMap = config["featConfig"] as? [String: Any] ?? [:]

    let transducerMap = modelMap["transducer"] as? [String: Any] ?? [:]
    let paraformerMap = modelMap["paraformer"] as? [String: Any] ?? [:]
    let zipformer2CtcMap = modelMap["zipformer2Ctc"] as? [String: Any] ?? [:]

    let featConfig = sherpaOnnxFeatureConfig(
      sampleRate: featMap["sampleRate"] as? Int ?? 16000,
      featureDim: featMap["featureDim"] as? Int ?? 80
    )

    let modelConfig = sherpaOnnxOnlineModelConfig(
      tokens: modelMap["tokens"] as? String ?? "",
      transducer: sherpaOnnxOnlineTransducerModelConfig(
        encoder: transducerMap["encoder"] as? String ?? "",
        decoder: transducerMap["decoder"] as? String ?? "",
        joiner: transducerMap["joiner"] as? String ?? ""
      ),
      paraformer: sherpaOnnxOnlineParaformerModelConfig(
        encoder: paraformerMap["encoder"] as? String ?? "",
        decoder: paraformerMap["decoder"] as? String ?? ""
      ),
      zipformer2Ctc: sherpaOnnxOnlineZipformer2CtcModelConfig(
        model: zipformer2CtcMap["model"] as? String ?? ""
      ),
      numThreads: modelMap["numThreads"] as? Int ?? 1,
      provider: modelMap["provider"] as? String ?? "cpu",
      debug: (modelMap["debug"] as? Bool == true) ? 1 : 0,
      modelType: modelMap["modelType"] as? String ?? ""
    )

    return sherpaOnnxOnlineRecognizerConfig(
      featConfig: featConfig,
      modelConfig: modelConfig,
      enableEndpoint: config["enableEndpoint"] as? Bool ?? false,
      rule1MinTrailingSilence: (config["rule1MinTrailingSilence"] as? NSNumber)?.floatValue ?? 2.4,
      rule2MinTrailingSilence: (config["rule2MinTrailingSilence"] as? NSNumber)?.floatValue ?? 1.2,
      rule3MinUtteranceLength: (config["rule3MinUtteranceLength"] as? NSNumber)?.floatValue ?? 30,
      decodingMethod: config["decodingMethod"] as? String ?? "greedy_search",
      maxActivePaths: config["maxActivePaths"] as? Int ?? 4,
      hotwordsFile: config["hotwordsFile"] as? String ?? "",
      hotwordsScore: (config["hotwordsScore"] as? NSNumber)?.floatValue ?? 1.5,
      ruleFsts: config["ruleFsts"] as? String ?? "",
      ruleFars: config["ruleFars"] as? String ?? "",
      blankPenalty: (config["blankPenalty"] as? NSNumber)?.floatValue ?? 0.0
    )
  }

  private static func requireTtsFile(_ path: String, label: String) throws {
    guard !path.isEmpty else {
      throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "\(label) path is empty. Check your model config."])
    }
    let fm = FileManager.default
    guard fm.fileExists(atPath: path) else {
      throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "\(label) not found: \(path)"])
    }
    if let attrs = try? fm.attributesOfItem(atPath: path),
       let size = attrs[.size] as? UInt64, size == 0 {
      throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "\(label) is empty (0 bytes): \(path)"])
    }
  }

  private static func validateTtsConfig(_ config: [String: Any]) throws {
    let modelMap = config["model"] as? [String: Any] ?? [:]
    let vitsMap = modelMap["vits"] as? [String: Any] ?? [:]
    let matchaMap = modelMap["matcha"] as? [String: Any] ?? [:]
    let kokoroMap = modelMap["kokoro"] as? [String: Any] ?? [:]
    let zipvoiceMap = modelMap["zipvoice"] as? [String: Any] ?? [:]
    let kittenMap = modelMap["kitten"] as? [String: Any] ?? [:]
    let pocketMap = modelMap["pocket"] as? [String: Any] ?? [:]
    let supertonicMap = modelMap["supertonic"] as? [String: Any] ?? [:]

    let vitsModel = vitsMap["model"] as? String ?? ""
    let matchaAcoustic = matchaMap["acousticModel"] as? String ?? ""
    let kokoroModel = kokoroMap["model"] as? String ?? ""
    let zipvoiceEncoder = zipvoiceMap["encoder"] as? String ?? ""
    let kittenModel = kittenMap["model"] as? String ?? ""
    let pocketLmMain = pocketMap["lmMain"] as? String ?? ""
    let supertonicTextEncoder = supertonicMap["textEncoder"] as? String ?? ""

    let hasVits = !vitsModel.isEmpty
    let hasMatcha = !matchaAcoustic.isEmpty
    let hasKokoro = !kokoroModel.isEmpty
    let hasZipVoice = !zipvoiceEncoder.isEmpty
    let hasKitten = !kittenModel.isEmpty
    let hasPocket = !pocketLmMain.isEmpty
    let hasSupertonic = !supertonicTextEncoder.isEmpty

    if !hasVits && !hasMatcha && !hasKokoro && !hasZipVoice && !hasKitten && !hasPocket && !hasSupertonic {
      throw NSError(domain: "ExpoSherpaOnnx", code: -1, userInfo: [NSLocalizedDescriptionKey: "No TTS model files specified. Provide at least one model type (vits, matcha, kokoro, zipvoice, kitten, pocket, or supertonic)."])
    }

    if hasVits {
      try requireTtsFile(vitsModel, label: "vits model")
      let tokens = vitsMap["tokens"] as? String ?? ""
      if !tokens.isEmpty { try requireTtsFile(tokens, label: "vits tokens") }
      let lexicon = vitsMap["lexicon"] as? String ?? ""
      if !lexicon.isEmpty { try requireTtsFile(lexicon, label: "vits lexicon") }
    }
    if hasMatcha {
      try requireTtsFile(matchaAcoustic, label: "matcha acousticModel")
      let vocoder = matchaMap["vocoder"] as? String ?? ""
      try requireTtsFile(vocoder, label: "matcha vocoder")
      let tokens = matchaMap["tokens"] as? String ?? ""
      if !tokens.isEmpty { try requireTtsFile(tokens, label: "matcha tokens") }
    }
    if hasKokoro {
      try requireTtsFile(kokoroModel, label: "kokoro model")
      let voices = kokoroMap["voices"] as? String ?? ""
      if !voices.isEmpty { try requireTtsFile(voices, label: "kokoro voices") }
      let tokens = kokoroMap["tokens"] as? String ?? ""
      if !tokens.isEmpty { try requireTtsFile(tokens, label: "kokoro tokens") }
    }
    if hasZipVoice {
      try requireTtsFile(zipvoiceEncoder, label: "zipvoice encoder")
      let decoder = zipvoiceMap["decoder"] as? String ?? ""
      try requireTtsFile(decoder, label: "zipvoice decoder")
      let vocoder = zipvoiceMap["vocoder"] as? String ?? ""
      try requireTtsFile(vocoder, label: "zipvoice vocoder")
    }
    if hasKitten {
      try requireTtsFile(kittenModel, label: "kitten model")
      let voices = kittenMap["voices"] as? String ?? ""
      if !voices.isEmpty { try requireTtsFile(voices, label: "kitten voices") }
    }
    if hasPocket {
      try requireTtsFile(pocketLmMain, label: "pocket lmMain")
      let lmFlow = pocketMap["lmFlow"] as? String ?? ""
      try requireTtsFile(lmFlow, label: "pocket lmFlow")
      let encoder = pocketMap["encoder"] as? String ?? ""
      try requireTtsFile(encoder, label: "pocket encoder")
      let decoder = pocketMap["decoder"] as? String ?? ""
      try requireTtsFile(decoder, label: "pocket decoder")
      let textConditioner = pocketMap["textConditioner"] as? String ?? ""
      try requireTtsFile(textConditioner, label: "pocket textConditioner")
    }
    if hasSupertonic {
      try requireTtsFile(supertonicTextEncoder, label: "supertonic textEncoder")
      let durationPredictor = supertonicMap["durationPredictor"] as? String ?? ""
      try requireTtsFile(durationPredictor, label: "supertonic durationPredictor")
      let vectorEstimator = supertonicMap["vectorEstimator"] as? String ?? ""
      try requireTtsFile(vectorEstimator, label: "supertonic vectorEstimator")
      let vocoder = supertonicMap["vocoder"] as? String ?? ""
      try requireTtsFile(vocoder, label: "supertonic vocoder")
    }

    NSLog("[ExpoSherpaOnnx] TTS config validated OK")
  }

  private static func buildOfflineTtsConfig(_ config: [String: Any]) -> SherpaOnnxOfflineTtsConfig {
    let modelMap = config["model"] as? [String: Any] ?? [:]

    let vitsMap = modelMap["vits"] as? [String: Any] ?? [:]
    let matchaMap = modelMap["matcha"] as? [String: Any] ?? [:]
    let kokoroMap = modelMap["kokoro"] as? [String: Any] ?? [:]
    let zipvoiceMap = modelMap["zipvoice"] as? [String: Any] ?? [:]
    let kittenMap = modelMap["kitten"] as? [String: Any] ?? [:]
    let pocketMap = modelMap["pocket"] as? [String: Any] ?? [:]
    let supertonicMap = modelMap["supertonic"] as? [String: Any] ?? [:]

    let vits = sherpaOnnxOfflineTtsVitsModelConfig(
      model: vitsMap["model"] as? String ?? "",
      lexicon: vitsMap["lexicon"] as? String ?? "",
      tokens: vitsMap["tokens"] as? String ?? "",
      dataDir: vitsMap["dataDir"] as? String ?? "",
      noiseScale: Float(vitsMap["noiseScale"] as? Double ?? 0.667),
      noiseScaleW: Float(vitsMap["noiseScaleW"] as? Double ?? 0.8),
      lengthScale: Float(vitsMap["lengthScale"] as? Double ?? 1.0),
      dictDir: vitsMap["dictDir"] as? String ?? ""
    )

    let matcha = sherpaOnnxOfflineTtsMatchaModelConfig(
      acousticModel: matchaMap["acousticModel"] as? String ?? "",
      vocoder: matchaMap["vocoder"] as? String ?? "",
      lexicon: matchaMap["lexicon"] as? String ?? "",
      tokens: matchaMap["tokens"] as? String ?? "",
      dataDir: matchaMap["dataDir"] as? String ?? "",
      noiseScale: Float(matchaMap["noiseScale"] as? Double ?? 0.667),
      lengthScale: Float(matchaMap["lengthScale"] as? Double ?? 1.0),
      dictDir: matchaMap["dictDir"] as? String ?? ""
    )

    let kokoro = sherpaOnnxOfflineTtsKokoroModelConfig(
      model: kokoroMap["model"] as? String ?? "",
      voices: kokoroMap["voices"] as? String ?? "",
      tokens: kokoroMap["tokens"] as? String ?? "",
      dataDir: kokoroMap["dataDir"] as? String ?? "",
      lengthScale: Float(kokoroMap["lengthScale"] as? Double ?? 1.0),
      dictDir: kokoroMap["dictDir"] as? String ?? "",
      lexicon: kokoroMap["lexicon"] as? String ?? "",
      lang: kokoroMap["lang"] as? String ?? ""
    )

    let kitten = sherpaOnnxOfflineTtsKittenModelConfig(
      model: kittenMap["model"] as? String ?? "",
      voices: kittenMap["voices"] as? String ?? "",
      tokens: kittenMap["tokens"] as? String ?? "",
      dataDir: kittenMap["dataDir"] as? String ?? "",
      lengthScale: Float(kittenMap["lengthScale"] as? Double ?? 1.0)
    )

    let zipvoice = sherpaOnnxOfflineTtsZipvoiceModelConfig(
      tokens: zipvoiceMap["tokens"] as? String ?? "",
      encoder: zipvoiceMap["encoder"] as? String ?? "",
      decoder: zipvoiceMap["decoder"] as? String ?? "",
      vocoder: zipvoiceMap["vocoder"] as? String ?? "",
      dataDir: zipvoiceMap["dataDir"] as? String ?? "",
      lexicon: zipvoiceMap["lexicon"] as? String ?? "",
      featScale: Float(zipvoiceMap["featScale"] as? Double ?? 0.1),
      tShift: Float(zipvoiceMap["tShift"] as? Double ?? 0.5),
      targetRms: Float(zipvoiceMap["targetRms"] as? Double ?? 0.1),
      guidanceScale: Float(zipvoiceMap["guidanceScale"] as? Double ?? 1.0)
    )

    let pocket = sherpaOnnxOfflineTtsPocketModelConfig(
      lmFlow: pocketMap["lmFlow"] as? String ?? "",
      lmMain: pocketMap["lmMain"] as? String ?? "",
      encoder: pocketMap["encoder"] as? String ?? "",
      decoder: pocketMap["decoder"] as? String ?? "",
      textConditioner: pocketMap["textConditioner"] as? String ?? "",
      vocabJson: pocketMap["vocabJson"] as? String ?? "",
      tokenScoresJson: pocketMap["tokenScoresJson"] as? String ?? "",
      voiceEmbeddingCacheCapacity: pocketMap["voiceEmbeddingCacheCapacity"] as? Int ?? 50
    )

    let supertonic = sherpaOnnxOfflineTtsSupertonicModelConfig(
      durationPredictor: supertonicMap["durationPredictor"] as? String ?? "",
      textEncoder: supertonicMap["textEncoder"] as? String ?? "",
      vectorEstimator: supertonicMap["vectorEstimator"] as? String ?? "",
      vocoder: supertonicMap["vocoder"] as? String ?? "",
      ttsJson: supertonicMap["ttsJson"] as? String ?? "",
      unicodeIndexer: supertonicMap["unicodeIndexer"] as? String ?? "",
      voiceStyle: supertonicMap["voiceStyle"] as? String ?? ""
    )

    let model = sherpaOnnxOfflineTtsModelConfig(
      vits: vits,
      matcha: matcha,
      kokoro: kokoro,
      numThreads: modelMap["numThreads"] as? Int ?? 2,
      debug: (modelMap["debug"] as? Bool ?? false) ? 1 : 0,
      provider: modelMap["provider"] as? String ?? "cpu",
      kitten: kitten,
      zipvoice: zipvoice,
      pocket: pocket,
      supertonic: supertonic
    )

    return sherpaOnnxOfflineTtsConfig(
      model: model,
      ruleFsts: config["ruleFsts"] as? String ?? "",
      ruleFars: config["ruleFars"] as? String ?? "",
      maxNumSentences: config["maxNumSentences"] as? Int ?? 1,
      silenceScale: Float(config["silenceScale"] as? Double ?? 0.2)
    )
  }

  private static func buildVadModelConfig(_ config: [String: Any]) -> SherpaOnnxVadModelConfig {
    let sileroMap = config["sileroVadModelConfig"] as? [String: Any] ?? [:]
    let tenMap = config["tenVadModelConfig"] as? [String: Any] ?? [:]

    let silero = sherpaOnnxSileroVadModelConfig(
      model: sileroMap["model"] as? String ?? "",
      threshold: Float(sileroMap["threshold"] as? Double ?? 0.5),
      minSilenceDuration: Float(sileroMap["minSilenceDuration"] as? Double ?? 0.25),
      minSpeechDuration: Float(sileroMap["minSpeechDuration"] as? Double ?? 0.25),
      windowSize: sileroMap["windowSize"] as? Int ?? 512,
      maxSpeechDuration: Float(sileroMap["maxSpeechDuration"] as? Double ?? 5.0)
    )

    let tenVad = sherpaOnnxTenVadModelConfig(
      model: tenMap["model"] as? String ?? "",
      threshold: Float(tenMap["threshold"] as? Double ?? 0.5),
      minSilenceDuration: Float(tenMap["minSilenceDuration"] as? Double ?? 0.25),
      minSpeechDuration: Float(tenMap["minSpeechDuration"] as? Double ?? 0.25),
      windowSize: tenMap["windowSize"] as? Int ?? 256,
      maxSpeechDuration: Float(tenMap["maxSpeechDuration"] as? Double ?? 5.0)
    )

    return sherpaOnnxVadModelConfig(
      sileroVad: silero,
      sampleRate: Int32(config["sampleRate"] as? Int ?? 16000),
      numThreads: config["numThreads"] as? Int ?? 1,
      provider: config["provider"] as? String ?? "cpu",
      debug: (config["debug"] as? Bool ?? false) ? 1 : 0,
      tenVad: tenVad
    )
  }

  private static func buildKeywordSpotterConfig(_ config: [String: Any]) -> SherpaOnnxKeywordSpotterConfig {
    let modelMap = config["modelConfig"] as? [String: Any] ?? [:]
    let featMap = config["featConfig"] as? [String: Any] ?? [:]
    let transducerMap = modelMap["transducer"] as? [String: Any] ?? [:]

    let feat = SherpaOnnxFeatureConfig(
      sample_rate: Int32(featMap["sampleRate"] as? Int ?? 16000),
      feature_dim: Int32(featMap["featureDim"] as? Int ?? 80)
    )

    let transducer = sherpaOnnxOnlineTransducerModelConfig(
      encoder: transducerMap["encoder"] as? String ?? "",
      decoder: transducerMap["decoder"] as? String ?? "",
      joiner: transducerMap["joiner"] as? String ?? ""
    )

    let paraformerMap = modelMap["paraformer"] as? [String: Any] ?? [:]
    let paraformer = sherpaOnnxOnlineParaformerModelConfig(
      encoder: paraformerMap["encoder"] as? String ?? "",
      decoder: paraformerMap["decoder"] as? String ?? ""
    )

    let zipformerCtcMap = modelMap["zipformer2Ctc"] as? [String: Any] ?? [:]
    let zipformerCtc = sherpaOnnxOnlineZipformer2CtcModelConfig(
      model: zipformerCtcMap["model"] as? String ?? ""
    )

    let modelConfig = sherpaOnnxOnlineModelConfig(
      tokens: modelMap["tokens"] as? String ?? "",
      transducer: transducer,
      paraformer: paraformer,
      zipformer2Ctc: zipformerCtc,
      numThreads: modelMap["numThreads"] as? Int ?? 1,
      provider: modelMap["provider"] as? String ?? "cpu",
      debug: (modelMap["debug"] as? Bool ?? false) ? 1 : 0,
      modelType: modelMap["modelType"] as? String ?? ""
    )

    return sherpaOnnxKeywordSpotterConfig(
      featConfig: feat,
      modelConfig: modelConfig,
      keywordsFile: config["keywordsFile"] as? String ?? "",
      maxActivePaths: config["maxActivePaths"] as? Int ?? 4,
      numTrailingBlanks: config["numTrailingBlanks"] as? Int ?? 2,
      keywordsScore: Float(config["keywordsScore"] as? Double ?? 1.5),
      keywordsThreshold: Float(config["keywordsThreshold"] as? Double ?? 0.25)
    )
  }
}

enum ModelPathError: Error, CustomStringConvertible {
  case invalidConfig
  case unknownType(String)
  case assetNotFound(String)
  case fileNotFound(String)
  case pathNotFound(String)

  var description: String {
    switch self {
    case .invalidConfig:
      return "Invalid model path config: missing 'type' or 'path'"
    case .unknownType(let t):
      return "Unknown model path type: '\(t)'. Expected 'asset', 'file', or 'auto'"
    case .assetNotFound(let p):
      return "Asset not found: '\(p)'"
    case .fileNotFound(let p):
      return "File not found: '\(p)'"
    case .pathNotFound(let p):
      return "Path not found: '\(p)'"
    }
  }
}

enum SherpaError: Error, CustomStringConvertible {
  case invalidHandle(String, Int)

  var description: String {
    switch self {
    case .invalidHandle(let type, let handle):
      return "Invalid \(type) handle: \(handle)"
    }
  }
}
