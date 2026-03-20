package expo.modules.sherpaonnx

import android.util.Log
import com.k2fsa.sherpa.onnx.*
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "ExpoSherpaOnnx"

class ExpoSherpaOnnxModule : Module() {
  private val handleCounter = AtomicInteger(0)
  private val offlineRecognizers = ConcurrentHashMap<Int, OfflineRecognizer>()
  private val onlineRecognizers = ConcurrentHashMap<Int, OnlineRecognizer>()
  private val onlineStreams = ConcurrentHashMap<Int, OnlineStream>()
  private val streamToRecognizer = ConcurrentHashMap<Int, Int>()

  override fun definition() = ModuleDefinition {
    Name("ExpoSherpaOnnx")

    OnDestroy {
      val streams = onlineStreams.toMap()
      onlineStreams.clear()
      streamToRecognizer.clear()
      streams.values.forEach { try { it.release() } catch (_: Exception) {} }

      val onlineRecs = onlineRecognizers.toMap()
      onlineRecognizers.clear()
      onlineRecs.values.forEach { try { it.release() } catch (_: Exception) {} }

      val offlineRecs = offlineRecognizers.toMap()
      offlineRecognizers.clear()
      offlineRecs.values.forEach { try { it.release() } catch (_: Exception) {} }
    }

    // Version info

    Function("getVersion") {
      VersionInfo.version
    }

    Function("getGitSha1") {
      VersionInfo.gitSha1
    }

    Function("getGitDate") {
      VersionInfo.gitDate
    }

    Function("getVersionInfo") {
      mapOf(
        "version" to VersionInfo.version,
        "gitSha1" to VersionInfo.gitSha1,
        "gitDate" to VersionInfo.gitDate,
      )
    }

    Function("getAppPaths") {
      val context = appContext.reactContext ?: throw IllegalStateException("React context not available")
      val docsDir = context.filesDir.absolutePath
      val cacheDir = context.cacheDir.absolutePath
      val modelsDir = File(context.filesDir, "models").also { it.mkdirs() }.absolutePath

      mapOf(
        "documentsDir" to docsDir,
        "cacheDir" to cacheDir,
        "modelsDir" to modelsDir,
      )
    }

    AsyncFunction("resolveModelPath") { config: Map<String, String> ->
      val type = config["type"] ?: throw IllegalArgumentException("Missing 'type' in model path config")
      val path = config["path"] ?: throw IllegalArgumentException("Missing 'path' in model path config")

      when (type) {
        "asset" -> resolveAssetPath(path)
        "file" -> resolveFilePath(path)
        "auto" -> {
          try {
            resolveAssetPath(path)
          } catch (_: Exception) {
            resolveFilePath(path)
          }
        }
        else -> throw IllegalArgumentException("Unknown model path type: '$type'. Expected 'asset', 'file', or 'auto'")
      }
    }

    AsyncFunction("listModelsAtPath") { path: String, recursive: Boolean ->
      val resolvedPath = resolveDirectoryPath(path)
      val dir = File(resolvedPath)

      if (recursive) {
        dir.walk()
          .filter { it != dir }
          .map { it.relativeTo(dir).path }
          .toList()
      } else {
        dir.listFiles()?.map { it.name } ?: emptyList()
      }
    }

    // =========================================================================
    // Offline ASR
    // =========================================================================

    AsyncFunction("createOfflineRecognizer") { config: Map<String, Any?> ->
      val recognizerConfig = buildOfflineRecognizerConfig(config)
      validateOfflineConfig(recognizerConfig)
      Log.i(TAG, "Creating offline recognizer (validated)...")
      val recognizer = OfflineRecognizer(null, recognizerConfig)
      Log.i(TAG, "  recognizer created, isValid=${recognizer.isValid}")
      if (!recognizer.isValid) {
        throw Exception("Failed to create offline recognizer. Native model loading returned null.")
      }
      val handle = handleCounter.incrementAndGet()
      offlineRecognizers[handle] = recognizer
      handle
    }

    AsyncFunction("offlineRecognizerDecode") { handle: Int, samples: List<Double>, sampleRate: Int ->
      val recognizer = offlineRecognizers[handle]
        ?: throw IllegalArgumentException("Invalid offline recognizer handle: $handle")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      val stream = recognizer.createStream()
      stream.acceptWaveform(floatSamples, sampleRate)
      recognizer.decode(stream)
      val result = recognizer.getResult(stream)
      stream.release()
      mapOf(
        "text" to result.text,
        "tokens" to result.tokens.toList(),
        "timestamps" to result.timestamps.toList(),
        "lang" to result.lang,
        "emotion" to result.emotion,
        "event" to result.event,
        "durations" to result.durations.toList(),
      )
    }

    AsyncFunction("offlineRecognizerDecodeFile") { handle: Int, filePath: String ->
      val recognizer = offlineRecognizers[handle]
        ?: throw IllegalArgumentException("Invalid offline recognizer handle: $handle")
      val waveData = WaveReader.readWave(filePath)
      val stream = recognizer.createStream()
      stream.acceptWaveform(waveData.samples, waveData.sampleRate)
      recognizer.decode(stream)
      val result = recognizer.getResult(stream)
      stream.release()
      mapOf(
        "text" to result.text,
        "tokens" to result.tokens.toList(),
        "timestamps" to result.timestamps.toList(),
        "lang" to result.lang,
        "emotion" to result.emotion,
        "event" to result.event,
        "durations" to result.durations.toList(),
      )
    }

    AsyncFunction("destroyOfflineRecognizer") { handle: Int ->
      val recognizer = offlineRecognizers.remove(handle)
        ?: throw IllegalArgumentException("Invalid offline recognizer handle: $handle")
      recognizer.release()
    }

    // =========================================================================
    // Online (Streaming) ASR
    // =========================================================================

    AsyncFunction("createOnlineRecognizer") { config: Map<String, Any?> ->
      val recognizerConfig = buildOnlineRecognizerConfig(config)
      validateOnlineConfig(recognizerConfig)
      Log.i(TAG, "Creating online recognizer (validated)...")
      val recognizer = OnlineRecognizer(null, recognizerConfig)
      Log.i(TAG, "  recognizer created, isValid=${recognizer.isValid}")
      if (!recognizer.isValid) {
        throw Exception("Failed to create online recognizer. Native model loading returned null.")
      }
      val handle = handleCounter.incrementAndGet()
      onlineRecognizers[handle] = recognizer
      Log.i(TAG, "  online recognizer handle=$handle")
      handle
    }

    AsyncFunction("createOnlineStream") { recognizerHandle: Int, hotwords: String ->
      val recognizer = onlineRecognizers[recognizerHandle]
        ?: throw IllegalArgumentException("Invalid online recognizer handle: $recognizerHandle")
      val stream = recognizer.createStream(hotwords)
      val streamHandle = handleCounter.incrementAndGet()
      onlineStreams[streamHandle] = stream
      streamToRecognizer[streamHandle] = recognizerHandle
      streamHandle
    }

    AsyncFunction("onlineStreamAcceptWaveform") { streamHandle: Int, samples: List<Double>, sampleRate: Int ->
      val stream = onlineStreams[streamHandle] ?: return@AsyncFunction
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      stream.acceptWaveform(floatSamples, sampleRate)
    }

    AsyncFunction("onlineStreamInputFinished") { streamHandle: Int ->
      val stream = onlineStreams[streamHandle] ?: return@AsyncFunction
      stream.inputFinished()
    }

    AsyncFunction("onlineRecognizerDecode") { recognizerHandle: Int, streamHandle: Int ->
      val recognizer = onlineRecognizers[recognizerHandle] ?: return@AsyncFunction
      val stream = onlineStreams[streamHandle] ?: return@AsyncFunction
      recognizer.decode(stream)
    }

    AsyncFunction("onlineRecognizerIsReady") { recognizerHandle: Int, streamHandle: Int ->
      val recognizer = onlineRecognizers[recognizerHandle] ?: return@AsyncFunction false
      val stream = onlineStreams[streamHandle] ?: return@AsyncFunction false
      recognizer.isReady(stream)
    }

    AsyncFunction("onlineRecognizerIsEndpoint") { recognizerHandle: Int, streamHandle: Int ->
      val recognizer = onlineRecognizers[recognizerHandle] ?: return@AsyncFunction false
      val stream = onlineStreams[streamHandle] ?: return@AsyncFunction false
      recognizer.isEndpoint(stream)
    }

    AsyncFunction("onlineRecognizerGetResult") { recognizerHandle: Int, streamHandle: Int ->
      val recognizer = onlineRecognizers[recognizerHandle]
        ?: return@AsyncFunction mapOf("text" to "", "tokens" to emptyList<String>(), "timestamps" to emptyList<Float>())
      val stream = onlineStreams[streamHandle]
        ?: return@AsyncFunction mapOf("text" to "", "tokens" to emptyList<String>(), "timestamps" to emptyList<Float>())
      val result = recognizer.getResult(stream)
      mapOf(
        "text" to result.text,
        "tokens" to result.tokens.toList(),
        "timestamps" to result.timestamps.toList(),
      )
    }

    AsyncFunction("onlineRecognizerReset") { recognizerHandle: Int, streamHandle: Int ->
      val recognizer = onlineRecognizers[recognizerHandle] ?: return@AsyncFunction
      val stream = onlineStreams[streamHandle] ?: return@AsyncFunction
      recognizer.reset(stream)
    }

    AsyncFunction("destroyOnlineStream") { streamHandle: Int ->
      val stream = onlineStreams.remove(streamHandle) ?: return@AsyncFunction
      streamToRecognizer.remove(streamHandle)
      stream.release()
    }

    AsyncFunction("destroyOnlineRecognizer") { recognizerHandle: Int ->
      val toRemove = streamToRecognizer.entries.filter { it.value == recognizerHandle }.map { it.key }
      for (sh in toRemove) {
        onlineStreams.remove(sh)?.release()
        streamToRecognizer.remove(sh)
      }
      val recognizer = onlineRecognizers.remove(recognizerHandle) ?: return@AsyncFunction
      recognizer.release()
    }

    // =========================================================================
    // Wave reading
    // =========================================================================

    AsyncFunction("readWaveFile") { filePath: String ->
      val waveData = WaveReader.readWave(filePath)
      mapOf(
        "samples" to waveData.samples.toList(),
        "sampleRate" to waveData.sampleRate,
      )
    }

    // =========================================================================
    // Hardware acceleration detection
    // =========================================================================

    Function("getAvailableProviders") {
      val providers = mutableListOf("cpu")
      try {
        val nnApiClass = Class.forName("android.os.Build\$VERSION")
        val sdkInt = nnApiClass.getField("SDK_INT").getInt(null)
        if (sdkInt >= 27) providers.add("nnapi")
      } catch (_: Exception) {}
      providers.add("xnnpack")
      providers.toList()
    }
  }

  private fun resolveAssetPath(path: String): String {
    val context = appContext.reactContext ?: throw IllegalStateException("React context not available")

    val modelsDir = File(context.filesDir, "models/$path")
    if (modelsDir.exists()) {
      return modelsDir.absolutePath
    }

    val cacheDir = File(context.cacheDir, path)
    if (cacheDir.exists()) {
      return cacheDir.absolutePath
    }

    val hasAsset = try {
      context.assets.list(path)?.isNotEmpty() == true
    } catch (_: Exception) {
      false
    }

    if (hasAsset) {
      val destDir = File(context.cacheDir, path)
      copyAssetDir(path, destDir)
      return destDir.absolutePath
    }

    throw IllegalArgumentException("Asset not found: '$path'")
  }

  private fun resolveFilePath(path: String): String {
    val file = File(path)
    if (!file.exists()) {
      throw IllegalArgumentException("File not found: '$path'")
    }
    return file.absolutePath
  }

  private fun resolveDirectoryPath(path: String): String {
    val file = File(path)
    if (file.isDirectory) {
      return file.absolutePath
    }

    val context = appContext.reactContext
    if (context != null) {
      val modelsDir = File(context.filesDir, "models/$path")
      if (modelsDir.isDirectory) {
        return modelsDir.absolutePath
      }
      val cacheDir = File(context.cacheDir, path)
      if (cacheDir.isDirectory) {
        return cacheDir.absolutePath
      }
    }

    throw IllegalArgumentException("Directory not found: '$path'")
  }

  private fun copyAssetDir(assetPath: String, destDir: File) {
    val context = appContext.reactContext ?: return
    val assets = context.assets

    val children = assets.list(assetPath) ?: return

    if (children.isEmpty()) {
      destDir.parentFile?.mkdirs()
      assets.open(assetPath).use { input ->
        destDir.outputStream().use { output ->
          input.copyTo(output)
        }
      }
    } else {
      destDir.mkdirs()
      for (child in children) {
        copyAssetDir("$assetPath/$child", File(destDir, child))
      }
    }
  }

  // ===========================================================================
  // Config builders - convert JS Maps to Kotlin config data classes
  // ===========================================================================

  @Suppress("UNCHECKED_CAST")
  private fun buildOfflineRecognizerConfig(config: Map<String, Any?>): OfflineRecognizerConfig {
    val modelMap = config["modelConfig"] as? Map<String, Any?> ?: emptyMap()
    val featMap = config["featConfig"] as? Map<String, Any?> ?: emptyMap()
    val hrMap = config["hr"] as? Map<String, Any?> ?: emptyMap()

    val whisperMap = modelMap["whisper"] as? Map<String, Any?> ?: emptyMap()
    val transducerMap = modelMap["transducer"] as? Map<String, Any?> ?: emptyMap()
    val paraformerMap = modelMap["paraformer"] as? Map<String, Any?> ?: emptyMap()
    val nemoCtcMap = modelMap["nemoEncDecCtc"] as? Map<String, Any?> ?: emptyMap()
    val senseVoiceMap = modelMap["senseVoice"] as? Map<String, Any?> ?: emptyMap()
    val moonshineMap = modelMap["moonshine"] as? Map<String, Any?> ?: emptyMap()

    return OfflineRecognizerConfig(
      featConfig = FeatureConfig(
        sampleRate = (featMap["sampleRate"] as? Number)?.toInt() ?: 16000,
        featureDim = (featMap["featureDim"] as? Number)?.toInt() ?: 80,
      ),
      modelConfig = OfflineModelConfig(
        tokens = modelMap["tokens"] as? String ?: "",
        numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 1,
        debug = modelMap["debug"] as? Boolean ?: false,
        provider = modelMap["provider"] as? String ?: "cpu",
        modelType = modelMap["modelType"] as? String ?: "",
        transducer = OfflineTransducerModelConfig(
          encoder = transducerMap["encoder"] as? String ?: "",
          decoder = transducerMap["decoder"] as? String ?: "",
          joiner = transducerMap["joiner"] as? String ?: "",
        ),
        paraformer = OfflineParaformerModelConfig(
          model = paraformerMap["model"] as? String ?: "",
        ),
        nemo = OfflineNemoEncDecCtcModelConfig(
          model = nemoCtcMap["model"] as? String ?: "",
        ),
        whisper = OfflineWhisperModelConfig(
          encoder = whisperMap["encoder"] as? String ?: "",
          decoder = whisperMap["decoder"] as? String ?: "",
          language = whisperMap["language"] as? String ?: "",
          task = whisperMap["task"] as? String ?: "transcribe",
          tailPaddings = (whisperMap["tailPaddings"] as? Number)?.toInt() ?: -1,
        ),
        senseVoice = OfflineSenseVoiceModelConfig(
          model = senseVoiceMap["model"] as? String ?: "",
          language = senseVoiceMap["language"] as? String ?: "",
          useInverseTextNormalization = senseVoiceMap["useInverseTextNormalization"] as? Boolean ?: true,
        ),
        moonshine = OfflineMoonshineModelConfig(
          preprocessor = moonshineMap["preprocessor"] as? String ?: "",
          encoder = moonshineMap["encoder"] as? String ?: "",
          uncachedDecoder = moonshineMap["uncachedDecoder"] as? String ?: "",
          cachedDecoder = moonshineMap["cachedDecoder"] as? String ?: "",
        ),
      ),
      decodingMethod = config["decodingMethod"] as? String ?: "greedy_search",
      maxActivePaths = (config["maxActivePaths"] as? Number)?.toInt() ?: 4,
      hotwordsFile = config["hotwordsFile"] as? String ?: "",
      hotwordsScore = (config["hotwordsScore"] as? Number)?.toFloat() ?: 1.5f,
      ruleFsts = config["ruleFsts"] as? String ?: "",
      ruleFars = config["ruleFars"] as? String ?: "",
      blankPenalty = (config["blankPenalty"] as? Number)?.toFloat() ?: 0.0f,
      hr = HomophoneReplacerConfig(
        dictDir = hrMap["dictDir"] as? String ?: "",
        lexicon = hrMap["lexicon"] as? String ?: "",
        ruleFsts = hrMap["ruleFsts"] as? String ?: "",
      ),
    )
  }

  @Suppress("UNCHECKED_CAST")
  private fun buildOnlineRecognizerConfig(config: Map<String, Any?>): OnlineRecognizerConfig {
    val modelMap = config["modelConfig"] as? Map<String, Any?> ?: emptyMap()
    val featMap = config["featConfig"] as? Map<String, Any?> ?: emptyMap()
    val endpointMap = config["endpointConfig"] as? Map<String, Any?> ?: emptyMap()
    val hrMap = config["hr"] as? Map<String, Any?> ?: emptyMap()

    val transducerMap = modelMap["transducer"] as? Map<String, Any?> ?: emptyMap()
    val paraformerMap = modelMap["paraformer"] as? Map<String, Any?> ?: emptyMap()
    val zipformer2CtcMap = modelMap["zipformer2Ctc"] as? Map<String, Any?> ?: emptyMap()

    val rule1Map = endpointMap["rule1"] as? Map<String, Any?> ?: emptyMap()
    val rule2Map = endpointMap["rule2"] as? Map<String, Any?> ?: emptyMap()
    val rule3Map = endpointMap["rule3"] as? Map<String, Any?> ?: emptyMap()

    return OnlineRecognizerConfig(
      featConfig = FeatureConfig(
        sampleRate = (featMap["sampleRate"] as? Number)?.toInt() ?: 16000,
        featureDim = (featMap["featureDim"] as? Number)?.toInt() ?: 80,
      ),
      modelConfig = OnlineModelConfig(
        tokens = modelMap["tokens"] as? String ?: "",
        numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 1,
        debug = modelMap["debug"] as? Boolean ?: false,
        provider = modelMap["provider"] as? String ?: "cpu",
        modelType = modelMap["modelType"] as? String ?: "",
        transducer = OnlineTransducerModelConfig(
          encoder = transducerMap["encoder"] as? String ?: "",
          decoder = transducerMap["decoder"] as? String ?: "",
          joiner = transducerMap["joiner"] as? String ?: "",
        ),
        paraformer = OnlineParaformerModelConfig(
          encoder = paraformerMap["encoder"] as? String ?: "",
          decoder = paraformerMap["decoder"] as? String ?: "",
        ),
        zipformer2Ctc = OnlineZipformer2CtcModelConfig(
          model = zipformer2CtcMap["model"] as? String ?: "",
        ),
      ),
      endpointConfig = EndpointConfig(
        rule1 = EndpointRule(
          mustContainNonSilence = rule1Map["mustContainNonSilence"] as? Boolean ?: false,
          minTrailingSilence = (rule1Map["minTrailingSilence"] as? Number)?.toFloat() ?: 2.4f,
          minUtteranceLength = (rule1Map["minUtteranceLength"] as? Number)?.toFloat() ?: 0.0f,
        ),
        rule2 = EndpointRule(
          mustContainNonSilence = rule2Map["mustContainNonSilence"] as? Boolean ?: true,
          minTrailingSilence = (rule2Map["minTrailingSilence"] as? Number)?.toFloat() ?: 1.2f,
          minUtteranceLength = (rule2Map["minUtteranceLength"] as? Number)?.toFloat() ?: 0.0f,
        ),
        rule3 = EndpointRule(
          mustContainNonSilence = rule3Map["mustContainNonSilence"] as? Boolean ?: false,
          minTrailingSilence = (rule3Map["minTrailingSilence"] as? Number)?.toFloat() ?: 0.0f,
          minUtteranceLength = (rule3Map["minUtteranceLength"] as? Number)?.toFloat() ?: 20.0f,
        ),
      ),
      enableEndpoint = config["enableEndpoint"] as? Boolean ?: true,
      decodingMethod = config["decodingMethod"] as? String ?: "greedy_search",
      maxActivePaths = (config["maxActivePaths"] as? Number)?.toInt() ?: 4,
      hotwordsFile = config["hotwordsFile"] as? String ?: "",
      hotwordsScore = (config["hotwordsScore"] as? Number)?.toFloat() ?: 1.5f,
      ruleFsts = config["ruleFsts"] as? String ?: "",
      ruleFars = config["ruleFars"] as? String ?: "",
      blankPenalty = (config["blankPenalty"] as? Number)?.toFloat() ?: 0.0f,
      hr = HomophoneReplacerConfig(
        dictDir = hrMap["dictDir"] as? String ?: "",
        lexicon = hrMap["lexicon"] as? String ?: "",
        ruleFsts = hrMap["ruleFsts"] as? String ?: "",
      ),
    )
  }

  private fun requireFile(path: String, label: String) {
    if (path.isBlank()) throw Exception("$label path is empty. Check your model config.")
    val f = File(path)
    if (!f.exists()) throw Exception("$label not found: $path")
    if (f.length() == 0L) throw Exception("$label is empty (0 bytes): $path")
  }

  private fun validateOfflineConfig(c: OfflineRecognizerConfig) {
    requireFile(c.modelConfig.tokens, "tokens")

    val w = c.modelConfig.whisper
    val t = c.modelConfig.transducer
    val p = c.modelConfig.paraformer
    val n = c.modelConfig.nemo
    val s = c.modelConfig.senseVoice
    val m = c.modelConfig.moonshine

    val hasWhisper = w.encoder.isNotBlank() || w.decoder.isNotBlank()
    val hasTransducer = t.encoder.isNotBlank() || t.decoder.isNotBlank() || t.joiner.isNotBlank()
    val hasParaformer = p.model.isNotBlank()
    val hasNemo = n.model.isNotBlank()
    val hasSenseVoice = s.model.isNotBlank()
    val hasMoonshine = m.encoder.isNotBlank()

    if (!hasWhisper && !hasTransducer && !hasParaformer && !hasNemo && !hasSenseVoice && !hasMoonshine) {
      throw Exception("No model files specified. Ensure your model directory contains the correct model and that detection identified its type.")
    }

    if (hasWhisper) {
      requireFile(w.encoder, "whisper encoder")
      requireFile(w.decoder, "whisper decoder")
    }
    if (hasTransducer) {
      requireFile(t.encoder, "transducer encoder")
      requireFile(t.decoder, "transducer decoder")
      requireFile(t.joiner, "transducer joiner")
    }
    if (hasParaformer) requireFile(p.model, "paraformer model")
    if (hasNemo) requireFile(n.model, "nemo model")
    if (hasSenseVoice) requireFile(s.model, "sense_voice model")
    if (hasMoonshine) {
      requireFile(m.preprocessor, "moonshine preprocessor")
      requireFile(m.encoder, "moonshine encoder")
      requireFile(m.uncachedDecoder, "moonshine uncachedDecoder")
    }

    Log.i(TAG, "Offline config validated OK")
  }

  private fun validateOnlineConfig(c: OnlineRecognizerConfig) {
    requireFile(c.modelConfig.tokens, "tokens")

    val t = c.modelConfig.transducer
    val p = c.modelConfig.paraformer

    val hasTransducer = t.encoder.isNotBlank() || t.decoder.isNotBlank() || t.joiner.isNotBlank()
    val hasParaformer = p.encoder.isNotBlank() || p.decoder.isNotBlank()

    if (!hasTransducer && !hasParaformer) {
      throw Exception("No streaming model files specified. Online/streaming ASR requires a transducer or streaming paraformer model.")
    }

    if (hasTransducer) {
      requireFile(t.encoder, "transducer encoder")
      requireFile(t.decoder, "transducer decoder")
      requireFile(t.joiner, "transducer joiner")
    }
    if (hasParaformer) {
      requireFile(p.encoder, "paraformer encoder")
      requireFile(p.decoder, "paraformer decoder")
    }

    Log.i(TAG, "Online config validated OK")
  }
}
