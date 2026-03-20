import ExpoModulesCore
import csherpa

public class ExpoSherpaOnnxModule: Module {
  private var handleCounter = 0
  private let lock = NSLock()
  private var offlineRecognizers: [Int: SherpaOnnxOfflineRecognizer] = [:]
  private var onlineRecognizers: [Int: SherpaOnnxRecognizer] = [:]

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
