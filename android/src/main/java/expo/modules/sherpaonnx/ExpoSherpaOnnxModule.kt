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
  private val offlineTtsEngines = ConcurrentHashMap<Int, OfflineTts>()
  private val vadEngines = ConcurrentHashMap<Int, Vad>()
  private val keywordSpotters = ConcurrentHashMap<Int, KeywordSpotter>()
  private val kwsStreams = ConcurrentHashMap<Int, OnlineStream>()
  private val kwsStreamToSpotter = ConcurrentHashMap<Int, Int>()
  private val speakerExtractors = ConcurrentHashMap<Int, SpeakerEmbeddingExtractor>()
  private val speakerStreams = ConcurrentHashMap<Int, OnlineStream>()
  private val speakerStreamToExtractor = ConcurrentHashMap<Int, Int>()
  private val speakerManagers = ConcurrentHashMap<Int, SpeakerEmbeddingManager>()
  private val diarizationEngines = ConcurrentHashMap<Int, OfflineSpeakerDiarization>()
  private val slidEngines = ConcurrentHashMap<Int, SpokenLanguageIdentification>()
  private val audioTaggingEngines = ConcurrentHashMap<Int, AudioTagging>()
  private val offlinePunctuationEngines = ConcurrentHashMap<Int, OfflinePunctuation>()
  private val onlinePunctuationEngines = ConcurrentHashMap<Int, OnlinePunctuation>()
  private val offlineSpeechDenoiserEngines = ConcurrentHashMap<Int, OfflineSpeechDenoiser>()
  private val onlineSpeechDenoiserEngines = ConcurrentHashMap<Int, OnlineSpeechDenoiser>()

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

      offlineTtsEngines.values.forEach { it.release() }
      offlineTtsEngines.clear()

      val kwsStr = kwsStreams.toMap()
      kwsStreams.clear()
      kwsStreamToSpotter.clear()
      kwsStr.values.forEach { try { it.release() } catch (_: Exception) {} }

      val spotters = keywordSpotters.toMap()
      keywordSpotters.clear()
      spotters.values.forEach { try { it.release() } catch (_: Exception) {} }

      vadEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      vadEngines.clear()

      val spkStreams = speakerStreams.toMap()
      speakerStreams.clear()
      speakerStreamToExtractor.clear()
      spkStreams.values.forEach { try { it.release() } catch (_: Exception) {} }

      val extractors = speakerExtractors.toMap()
      speakerExtractors.clear()
      extractors.values.forEach { try { it.release() } catch (_: Exception) {} }

      speakerManagers.values.forEach { try { it.release() } catch (_: Exception) {} }
      speakerManagers.clear()

      diarizationEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      diarizationEngines.clear()
      slidEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      slidEngines.clear()
      audioTaggingEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      audioTaggingEngines.clear()
      offlinePunctuationEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      offlinePunctuationEngines.clear()
      onlinePunctuationEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      onlinePunctuationEngines.clear()
      offlineSpeechDenoiserEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      offlineSpeechDenoiserEngines.clear()
      onlineSpeechDenoiserEngines.values.forEach { try { it.release() } catch (_: Exception) {} }
      onlineSpeechDenoiserEngines.clear()
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

    Events("ttsChunk", "ttsComplete", "ttsError")

    // =========================================================================
    // Offline TTS
    // =========================================================================

    AsyncFunction("createOfflineTts") { config: Map<String, Any?> ->
      Log.i(TAG, "=== createOfflineTts START ===")
      Log.i(TAG, "  Raw config keys: ${config.keys}")
      val ttsConfig = buildOfflineTtsConfig(config)
      Log.i(TAG, "  Built ttsConfig, running validation...")
      validateTtsConfig(ttsConfig)
      Log.i(TAG, "  Validation passed. Calling OfflineTts constructor...")
      val tts = try {
        OfflineTts(null, ttsConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  OfflineTts constructor threw: ${e.message}", e)
        throw Exception("Native TTS creation failed: ${e.message}")
      } catch (e: Error) {
        Log.e(TAG, "  OfflineTts constructor threw Error: ${e.message}", e)
        throw Exception("Native TTS creation failed (Error): ${e.message}")
      }
      Log.i(TAG, "  OfflineTts constructor returned, checking sampleRate...")
      val sr = try { tts.sampleRate() } catch (e: Exception) {
        Log.e(TAG, "  sampleRate() failed: ${e.message}", e)
        tts.release()
        throw Exception("TTS engine invalid (sampleRate failed): ${e.message}")
      }
      Log.i(TAG, "  sampleRate=$sr, checking numSpeakers...")
      val ns = try { tts.numSpeakers() } catch (e: Exception) {
        Log.e(TAG, "  numSpeakers() failed: ${e.message}", e)
        tts.release()
        throw Exception("TTS engine invalid (numSpeakers failed): ${e.message}")
      }
      Log.i(TAG, "  numSpeakers=$ns")
      val handle = handleCounter.incrementAndGet()
      offlineTtsEngines[handle] = tts
      Log.i(TAG, "=== createOfflineTts DONE handle=$handle sr=$sr ns=$ns ===")
      mapOf(
        "handle" to handle,
        "sampleRate" to sr,
        "numSpeakers" to ns,
      )
    }

    AsyncFunction("offlineTtsGenerate") { handle: Int, text: String, sid: Int, speed: Double ->
      Log.i(TAG, "=== offlineTtsGenerate START handle=$handle textLen=${text.length} sid=$sid speed=$speed ===")
      val tts = offlineTtsEngines[handle]
        ?: throw IllegalArgumentException("Invalid TTS handle: $handle")
      Log.i(TAG, "  Calling tts.generate()...")
      val audio = try {
        tts.generate(text, sid, speed.toFloat())
      } catch (e: Exception) {
        Log.e(TAG, "  tts.generate() threw: ${e.message}", e)
        throw Exception("TTS generate failed: ${e.message}")
      }
      Log.i(TAG, "  Generated ${audio.samples.size} samples at ${audio.sampleRate} Hz")
      Log.i(TAG, "=== offlineTtsGenerate DONE ===")
      mapOf(
        "samples" to audio.samples.map { it.toDouble() },
        "sampleRate" to audio.sampleRate,
      )
    }

    AsyncFunction("offlineTtsSampleRate") { handle: Int ->
      val tts = offlineTtsEngines[handle]
        ?: throw IllegalArgumentException("Invalid TTS handle: $handle")
      tts.sampleRate()
    }

    AsyncFunction("offlineTtsNumSpeakers") { handle: Int ->
      val tts = offlineTtsEngines[handle]
        ?: throw IllegalArgumentException("Invalid TTS handle: $handle")
      tts.numSpeakers()
    }

    AsyncFunction("destroyOfflineTts") { handle: Int ->
      Log.i(TAG, "=== destroyOfflineTts handle=$handle ===")
      val tts = offlineTtsEngines.remove(handle)
      if (tts != null) {
        try { tts.release() } catch (e: Exception) {
          Log.e(TAG, "  release() threw: ${e.message}", e)
        }
      }
      Log.i(TAG, "=== destroyOfflineTts DONE ===")
    }

    AsyncFunction("offlineTtsGenerateStreaming") { handle: Int, text: String, sid: Int, speed: Double, requestId: String ->
      Log.i(TAG, "=== offlineTtsGenerateStreaming START handle=$handle textLen=${text.length} ===")
      val tts = offlineTtsEngines[handle]
        ?: throw IllegalArgumentException("Invalid TTS handle: $handle")
      try {
        val audio = tts.generateWithCallback(text, sid, speed.toFloat()) { samples ->
          sendEvent("ttsChunk", mapOf(
            "requestId" to requestId,
            "samples" to samples.map { it.toDouble() },
          ))
          0
        }
        Log.i(TAG, "  Streaming done, ${audio.samples.size} total samples")
        sendEvent("ttsComplete", mapOf(
          "requestId" to requestId,
          "sampleRate" to audio.sampleRate,
        ))
      } catch (e: Exception) {
        Log.e(TAG, "  Streaming generate threw: ${e.message}", e)
        sendEvent("ttsError", mapOf(
          "requestId" to requestId,
          "error" to (e.message ?: "Unknown TTS error"),
        ))
      }
      Log.i(TAG, "=== offlineTtsGenerateStreaming DONE ===")
    }

    // =========================================================================
    // Voice Activity Detection (VAD)
    // =========================================================================

    AsyncFunction("createVad") { config: Map<String, Any?>, bufferSizeInSeconds: Double ->
      val vadConfig = buildVadModelConfig(config)
      validateVadConfig(vadConfig)
      Log.i(TAG, "=== createVad START ===")
      val vad = try {
        Vad(null, vadConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  Vad constructor threw: ${e.message}", e)
        throw Exception("Native VAD creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      vadEngines[handle] = vad
      Log.i(TAG, "=== createVad DONE handle=$handle ===")
      handle
    }

    AsyncFunction("vadAcceptWaveform") { handle: Int, samples: List<Double> ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      vad.acceptWaveform(floatSamples)
    }

    AsyncFunction("vadEmpty") { handle: Int ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      vad.empty()
    }

    AsyncFunction("vadIsSpeechDetected") { handle: Int ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      vad.isSpeechDetected()
    }

    AsyncFunction("vadPop") { handle: Int ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      vad.pop()
    }

    AsyncFunction("vadFront") { handle: Int ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      val segment = vad.front()
      mapOf(
        "start" to segment.start,
        "samples" to segment.samples.map { it.toDouble() },
      )
    }

    AsyncFunction("vadClear") { handle: Int ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      vad.clear()
    }

    AsyncFunction("vadReset") { handle: Int ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      vad.reset()
    }

    AsyncFunction("vadFlush") { handle: Int ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      vad.flush()
    }

    AsyncFunction("vadProcessFile") { handle: Int, filePath: String ->
      val vad = vadEngines[handle]
        ?: throw IllegalArgumentException("Invalid VAD handle: $handle")
      Log.i(TAG, "=== vadProcessFile START filePath=$filePath ===")
      val waveData = WaveReader.readWave(filePath)
      vad.reset()
      val windowSize = 512
      var i = 0
      while (i + windowSize <= waveData.samples.size) {
        val chunk = waveData.samples.copyOfRange(i, i + windowSize)
        vad.acceptWaveform(chunk)
        i += windowSize
      }
      vad.flush()
      val segments = mutableListOf<Map<String, Any>>()
      while (!vad.empty()) {
        val seg = vad.front()
        segments.add(mapOf(
          "start" to seg.start,
          "samples" to seg.samples.map { it.toDouble() },
        ))
        vad.pop()
      }
      Log.i(TAG, "=== vadProcessFile DONE ${segments.size} segments ===")
      segments.toList()
    }

    AsyncFunction("destroyVad") { handle: Int ->
      Log.i(TAG, "=== destroyVad handle=$handle ===")
      val vad = vadEngines.remove(handle)
      if (vad != null) {
        try { vad.release() } catch (e: Exception) {
          Log.e(TAG, "  VAD release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Keyword Spotting
    // =========================================================================

    AsyncFunction("createKeywordSpotter") { config: Map<String, Any?> ->
      val kwsConfig = buildKeywordSpotterConfig(config)
      validateKwsConfig(kwsConfig)
      Log.i(TAG, "=== createKeywordSpotter START ===")
      val spotter = try {
        KeywordSpotter(null, kwsConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  KeywordSpotter constructor threw: ${e.message}", e)
        throw Exception("Native KeywordSpotter creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      keywordSpotters[handle] = spotter
      Log.i(TAG, "=== createKeywordSpotter DONE handle=$handle ===")
      handle
    }

    AsyncFunction("createKeywordStream") { spotterHandle: Int, keywords: String ->
      val spotter = keywordSpotters[spotterHandle]
        ?: throw IllegalArgumentException("Invalid KeywordSpotter handle: $spotterHandle")
      val stream = spotter.createStream(keywords)
      val streamHandle = handleCounter.incrementAndGet()
      kwsStreams[streamHandle] = stream
      kwsStreamToSpotter[streamHandle] = spotterHandle
      streamHandle
    }

    AsyncFunction("keywordStreamAcceptWaveform") { streamHandle: Int, samples: List<Double>, sampleRate: Int ->
      val stream = kwsStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid KWS stream handle: $streamHandle")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      stream.acceptWaveform(floatSamples, sampleRate)
    }

    AsyncFunction("keywordSpotterIsReady") { spotterHandle: Int, streamHandle: Int ->
      val spotter = keywordSpotters[spotterHandle]
        ?: throw IllegalArgumentException("Invalid KeywordSpotter handle: $spotterHandle")
      val stream = kwsStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid KWS stream handle: $streamHandle")
      spotter.isReady(stream)
    }

    AsyncFunction("keywordSpotterDecode") { spotterHandle: Int, streamHandle: Int ->
      val spotter = keywordSpotters[spotterHandle]
        ?: throw IllegalArgumentException("Invalid KeywordSpotter handle: $spotterHandle")
      val stream = kwsStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid KWS stream handle: $streamHandle")
      spotter.decode(stream)
    }

    AsyncFunction("keywordSpotterGetResult") { spotterHandle: Int, streamHandle: Int ->
      val spotter = keywordSpotters[spotterHandle]
        ?: throw IllegalArgumentException("Invalid KeywordSpotter handle: $spotterHandle")
      val stream = kwsStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid KWS stream handle: $streamHandle")
      val result = spotter.getResult(stream)
      mapOf(
        "keyword" to result.keyword,
        "tokens" to result.tokens.toList(),
        "timestamps" to result.timestamps.map { it.toDouble() },
      )
    }

    AsyncFunction("keywordSpotterReset") { spotterHandle: Int, streamHandle: Int ->
      val spotter = keywordSpotters[spotterHandle]
        ?: throw IllegalArgumentException("Invalid KeywordSpotter handle: $spotterHandle")
      val stream = kwsStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid KWS stream handle: $streamHandle")
      spotter.reset(stream)
    }

    AsyncFunction("destroyKeywordStream") { streamHandle: Int ->
      val stream = kwsStreams.remove(streamHandle)
      kwsStreamToSpotter.remove(streamHandle)
      if (stream != null) {
        try { stream.release() } catch (_: Exception) {}
      }
    }

    AsyncFunction("destroyKeywordSpotter") { spotterHandle: Int ->
      Log.i(TAG, "=== destroyKeywordSpotter handle=$spotterHandle ===")
      val streamsToRemove = kwsStreamToSpotter.filter { it.value == spotterHandle }.keys
      streamsToRemove.forEach { sh ->
        kwsStreams.remove(sh)?.let { try { it.release() } catch (_: Exception) {} }
        kwsStreamToSpotter.remove(sh)
      }
      val spotter = keywordSpotters.remove(spotterHandle)
      if (spotter != null) {
        try { spotter.release() } catch (e: Exception) {
          Log.e(TAG, "  KWS release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Speaker Embedding Extractor
    // =========================================================================

    AsyncFunction("createSpeakerEmbeddingExtractor") { config: Map<String, Any?> ->
      val model = config["model"] as? String ?: ""
      if (model.isBlank()) throw Exception("Speaker embedding model path is required")
      requireFile(model, "speaker embedding model")

      val extractorConfig = SpeakerEmbeddingExtractorConfig(
        model = model,
        numThreads = (config["numThreads"] as? Number)?.toInt() ?: 1,
        debug = config["debug"] as? Boolean ?: false,
        provider = config["provider"] as? String ?: "cpu",
      )
      Log.i(TAG, "=== createSpeakerEmbeddingExtractor START ===")
      val extractor = try {
        SpeakerEmbeddingExtractor(null, extractorConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  SpeakerEmbeddingExtractor constructor threw: ${e.message}", e)
        throw Exception("Native SpeakerEmbeddingExtractor creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      speakerExtractors[handle] = extractor
      Log.i(TAG, "=== createSpeakerEmbeddingExtractor DONE handle=$handle dim=${extractor.dim()} ===")
      handle
    }

    AsyncFunction("speakerExtractorCreateStream") { extractorHandle: Int ->
      val extractor = speakerExtractors[extractorHandle]
        ?: throw IllegalArgumentException("Invalid speaker extractor handle: $extractorHandle")
      val stream = extractor.createStream()
      val streamHandle = handleCounter.incrementAndGet()
      speakerStreams[streamHandle] = stream
      speakerStreamToExtractor[streamHandle] = extractorHandle
      streamHandle
    }

    AsyncFunction("speakerStreamAcceptWaveform") { streamHandle: Int, samples: List<Double>, sampleRate: Int ->
      val stream = speakerStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid speaker stream handle: $streamHandle")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      stream.acceptWaveform(floatSamples, sampleRate)
    }

    AsyncFunction("speakerExtractorIsReady") { extractorHandle: Int, streamHandle: Int ->
      val extractor = speakerExtractors[extractorHandle]
        ?: throw IllegalArgumentException("Invalid speaker extractor handle: $extractorHandle")
      val stream = speakerStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid speaker stream handle: $streamHandle")
      extractor.isReady(stream)
    }

    AsyncFunction("speakerExtractorCompute") { extractorHandle: Int, streamHandle: Int ->
      val extractor = speakerExtractors[extractorHandle]
        ?: throw IllegalArgumentException("Invalid speaker extractor handle: $extractorHandle")
      val stream = speakerStreams[streamHandle]
        ?: throw IllegalArgumentException("Invalid speaker stream handle: $streamHandle")
      val embedding = extractor.compute(stream)
      embedding.map { it.toDouble() }
    }

    AsyncFunction("speakerExtractorDim") { extractorHandle: Int ->
      val extractor = speakerExtractors[extractorHandle]
        ?: throw IllegalArgumentException("Invalid speaker extractor handle: $extractorHandle")
      extractor.dim()
    }

    AsyncFunction("speakerExtractorComputeFromFile") { extractorHandle: Int, filePath: String ->
      val extractor = speakerExtractors[extractorHandle]
        ?: throw IllegalArgumentException("Invalid speaker extractor handle: $extractorHandle")
      Log.i(TAG, "=== speakerExtractorComputeFromFile START filePath=$filePath ===")
      val waveData = WaveReader.readWave(filePath)
      val stream = extractor.createStream()
      stream.acceptWaveform(waveData.samples, waveData.sampleRate)
      val embedding = extractor.compute(stream)
      stream.release()
      Log.i(TAG, "=== speakerExtractorComputeFromFile DONE dim=${embedding.size} ===")
      embedding.map { it.toDouble() }
    }

    AsyncFunction("destroySpeakerStream") { streamHandle: Int ->
      val stream = speakerStreams.remove(streamHandle)
      speakerStreamToExtractor.remove(streamHandle)
      if (stream != null) {
        try { stream.release() } catch (_: Exception) {}
      }
    }

    AsyncFunction("destroySpeakerEmbeddingExtractor") { extractorHandle: Int ->
      Log.i(TAG, "=== destroySpeakerEmbeddingExtractor handle=$extractorHandle ===")
      val streamsToRemove = speakerStreamToExtractor.filter { it.value == extractorHandle }.keys
      streamsToRemove.forEach { sh ->
        speakerStreams.remove(sh)?.let { try { it.release() } catch (_: Exception) {} }
        speakerStreamToExtractor.remove(sh)
      }
      val extractor = speakerExtractors.remove(extractorHandle)
      if (extractor != null) {
        try { extractor.release() } catch (e: Exception) {
          Log.e(TAG, "  SpeakerEmbeddingExtractor release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Speaker Embedding Manager
    // =========================================================================

    AsyncFunction("createSpeakerEmbeddingManager") { dim: Int ->
      Log.i(TAG, "=== createSpeakerEmbeddingManager dim=$dim ===")
      val manager = SpeakerEmbeddingManager(dim)
      val handle = handleCounter.incrementAndGet()
      speakerManagers[handle] = manager
      handle
    }

    AsyncFunction("speakerManagerAdd") { handle: Int, name: String, embedding: List<Double> ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      val floatEmbedding = FloatArray(embedding.size) { embedding[it].toFloat() }
      manager.add(name, floatEmbedding)
    }

    AsyncFunction("speakerManagerAddList") { handle: Int, name: String, embeddings: List<List<Double>> ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      val floatEmbeddings = Array(embeddings.size) { i ->
        FloatArray(embeddings[i].size) { j -> embeddings[i][j].toFloat() }
      }
      manager.add(name, floatEmbeddings)
    }

    AsyncFunction("speakerManagerRemove") { handle: Int, name: String ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      manager.remove(name)
    }

    AsyncFunction("speakerManagerSearch") { handle: Int, embedding: List<Double>, threshold: Double ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      val floatEmbedding = FloatArray(embedding.size) { embedding[it].toFloat() }
      manager.search(floatEmbedding, threshold.toFloat())
    }

    AsyncFunction("speakerManagerVerify") { handle: Int, name: String, embedding: List<Double>, threshold: Double ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      val floatEmbedding = FloatArray(embedding.size) { embedding[it].toFloat() }
      manager.verify(name, floatEmbedding, threshold.toFloat())
    }

    AsyncFunction("speakerManagerContains") { handle: Int, name: String ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      manager.contains(name)
    }

    AsyncFunction("speakerManagerNumSpeakers") { handle: Int ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      manager.numSpeakers()
    }

    AsyncFunction("speakerManagerAllSpeakerNames") { handle: Int ->
      val manager = speakerManagers[handle]
        ?: throw IllegalArgumentException("Invalid speaker manager handle: $handle")
      manager.allSpeakerNames().toList()
    }

    AsyncFunction("destroySpeakerEmbeddingManager") { handle: Int ->
      Log.i(TAG, "=== destroySpeakerEmbeddingManager handle=$handle ===")
      val manager = speakerManagers.remove(handle)
      if (manager != null) {
        try { manager.release() } catch (e: Exception) {
          Log.e(TAG, "  SpeakerEmbeddingManager release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Offline Speaker Diarization
    // =========================================================================

    AsyncFunction("createOfflineSpeakerDiarization") { config: Map<String, Any?> ->
      val diarizationConfig = buildOfflineSpeakerDiarizationConfig(config)
      Log.i(TAG, "=== createOfflineSpeakerDiarization START ===")
      val diarization = try {
        OfflineSpeakerDiarization(null, diarizationConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  OfflineSpeakerDiarization constructor threw: ${e.message}", e)
        throw Exception("Native OfflineSpeakerDiarization creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      diarizationEngines[handle] = diarization
      Log.i(TAG, "=== createOfflineSpeakerDiarization DONE handle=$handle sampleRate=${diarization.sampleRate()} ===")
      handle
    }

    AsyncFunction("offlineSpeakerDiarizationGetSampleRate") { handle: Int ->
      val diarization = diarizationEngines[handle]
        ?: throw IllegalArgumentException("Invalid diarization handle: $handle")
      diarization.sampleRate()
    }

    AsyncFunction("offlineSpeakerDiarizationProcess") { handle: Int, samples: List<Double> ->
      val diarization = diarizationEngines[handle]
        ?: throw IllegalArgumentException("Invalid diarization handle: $handle")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      val segments = diarization.process(floatSamples)
      segments.map { seg ->
        mapOf(
          "start" to seg.start.toDouble(),
          "end" to seg.end.toDouble(),
          "speaker" to seg.speaker,
        )
      }
    }

    AsyncFunction("offlineSpeakerDiarizationProcessFile") { handle: Int, filePath: String ->
      val diarization = diarizationEngines[handle]
        ?: throw IllegalArgumentException("Invalid diarization handle: $handle")
      Log.i(TAG, "=== offlineSpeakerDiarizationProcessFile START filePath=$filePath ===")
      val waveData = WaveReader.readWave(filePath)
      val segments = diarization.process(waveData.samples)
      Log.i(TAG, "=== offlineSpeakerDiarizationProcessFile DONE ${segments.size} segments ===")
      segments.map { seg ->
        mapOf(
          "start" to seg.start.toDouble(),
          "end" to seg.end.toDouble(),
          "speaker" to seg.speaker,
        )
      }
    }

    AsyncFunction("transcribeAndDiarizeFile") { diarizationHandle: Int, asrHandle: Int, filePath: String ->
      val diarization = diarizationEngines[diarizationHandle]
        ?: throw IllegalArgumentException("Invalid diarization handle: $diarizationHandle")
      val recognizer = offlineRecognizers[asrHandle]
        ?: throw IllegalArgumentException("Invalid offline recognizer handle: $asrHandle")
      Log.i(TAG, "=== transcribeAndDiarizeFile START filePath=$filePath ===")
      val waveData = WaveReader.readWave(filePath)
      val segments = diarization.process(waveData.samples)
      Log.i(TAG, "  Diarization found ${segments.size} segments, transcribing each...")
      val results = segments.map { seg ->
        val startSample = (seg.start * waveData.sampleRate).toInt().coerceIn(0, waveData.samples.size)
        val endSample = (seg.end * waveData.sampleRate).toInt().coerceIn(0, waveData.samples.size)
        val segSamples = waveData.samples.copyOfRange(startSample, endSample)
        val stream = recognizer.createStream()
        stream.acceptWaveform(segSamples, waveData.sampleRate)
        recognizer.decode(stream)
        val result = recognizer.getResult(stream)
        stream.release()
        mapOf(
          "speaker" to seg.speaker,
          "start" to seg.start.toDouble(),
          "end" to seg.end.toDouble(),
          "text" to result.text,
        )
      }
      Log.i(TAG, "=== transcribeAndDiarizeFile DONE ${results.size} transcribed segments ===")
      results
    }

    @Suppress("UNCHECKED_CAST")
    AsyncFunction("offlineSpeakerDiarizationSetConfig") { handle: Int, config: Map<String, Any?> ->
      val diarization = diarizationEngines[handle]
        ?: throw IllegalArgumentException("Invalid diarization handle: $handle")
      val newConfig = buildOfflineSpeakerDiarizationConfig(config)
      diarization.setConfig(newConfig)
    }

    AsyncFunction("destroyOfflineSpeakerDiarization") { handle: Int ->
      Log.i(TAG, "=== destroyOfflineSpeakerDiarization handle=$handle ===")
      val diarization = diarizationEngines.remove(handle)
      if (diarization != null) {
        try { diarization.release() } catch (e: Exception) {
          Log.e(TAG, "  OfflineSpeakerDiarization release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Spoken Language Identification
    // =========================================================================

    AsyncFunction("createSpokenLanguageIdentification") { config: Map<String, Any?> ->
      val whisperMap = config["whisper"] as? Map<String, Any?> ?: emptyMap()
      val slidConfig = SpokenLanguageIdentificationConfig(
        whisper = SpokenLanguageIdentificationWhisperConfig(
          encoder = whisperMap["encoder"] as? String ?: "",
          decoder = whisperMap["decoder"] as? String ?: "",
          tailPaddings = (whisperMap["tailPaddings"] as? Number)?.toInt() ?: -1,
        ),
        numThreads = (config["numThreads"] as? Number)?.toInt() ?: 1,
        debug = config["debug"] as? Boolean ?: false,
        provider = config["provider"] as? String ?: "cpu",
      )
      Log.i(TAG, "=== createSpokenLanguageIdentification START ===")
      val slid = try {
        SpokenLanguageIdentification(config = slidConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  SLID constructor threw: ${e.message}", e)
        throw Exception("Native SLID creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      slidEngines[handle] = slid
      Log.i(TAG, "=== createSpokenLanguageIdentification DONE handle=$handle ===")
      handle
    }

    AsyncFunction("spokenLanguageIdentificationCompute") { handle: Int, samples: List<Double>, sampleRate: Int ->
      val slid = slidEngines[handle]
        ?: throw IllegalArgumentException("Invalid SLID handle: $handle")
      val stream = slid.createStream()
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      stream.acceptWaveform(floatSamples, sampleRate)
      val lang = slid.compute(stream)
      stream.release()
      lang
    }

    AsyncFunction("spokenLanguageIdentificationComputeFromFile") { handle: Int, filePath: String ->
      val slid = slidEngines[handle]
        ?: throw IllegalArgumentException("Invalid SLID handle: $handle")
      Log.i(TAG, "=== spokenLanguageIdentificationComputeFromFile START ===")
      val waveData = WaveReader.readWave(filePath)
      val stream = slid.createStream()
      stream.acceptWaveform(waveData.samples, waveData.sampleRate)
      val lang = slid.compute(stream)
      stream.release()
      Log.i(TAG, "=== spokenLanguageIdentificationComputeFromFile DONE lang=$lang ===")
      lang
    }

    AsyncFunction("destroySpokenLanguageIdentification") { handle: Int ->
      Log.i(TAG, "=== destroySpokenLanguageIdentification handle=$handle ===")
      val slid = slidEngines.remove(handle)
      if (slid != null) {
        try { slid.release() } catch (e: Exception) {
          Log.e(TAG, "  SLID release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Audio Tagging
    // =========================================================================

    @Suppress("UNCHECKED_CAST")
    AsyncFunction("createAudioTagging") { config: Map<String, Any?> ->
      val modelMap = config["model"] as? Map<String, Any?> ?: emptyMap()
      val zipformerMap = modelMap["zipformer"] as? Map<String, Any?> ?: emptyMap()
      val taggingConfig = AudioTaggingConfig(
        model = AudioTaggingModelConfig(
          zipformer = OfflineZipformerAudioTaggingModelConfig(
            model = zipformerMap["model"] as? String ?: "",
          ),
          ced = modelMap["ced"] as? String ?: "",
          numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 1,
          debug = modelMap["debug"] as? Boolean ?: false,
          provider = modelMap["provider"] as? String ?: "cpu",
        ),
        labels = config["labels"] as? String ?: "",
        topK = (config["topK"] as? Number)?.toInt() ?: 5,
      )
      Log.i(TAG, "=== createAudioTagging START ===")
      val tagger = try {
        AudioTagging(config = taggingConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  AudioTagging constructor threw: ${e.message}", e)
        throw Exception("Native AudioTagging creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      audioTaggingEngines[handle] = tagger
      Log.i(TAG, "=== createAudioTagging DONE handle=$handle ===")
      handle
    }

    AsyncFunction("audioTaggingCompute") { handle: Int, samples: List<Double>, sampleRate: Int, topK: Int ->
      val tagger = audioTaggingEngines[handle]
        ?: throw IllegalArgumentException("Invalid AudioTagging handle: $handle")
      val stream = tagger.createStream()
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      stream.acceptWaveform(floatSamples, sampleRate)
      val events = tagger.compute(stream, topK)
      stream.release()
      events.map { ev ->
        mapOf("name" to ev.name, "index" to ev.index, "prob" to ev.prob.toDouble())
      }
    }

    AsyncFunction("audioTaggingComputeFromFile") { handle: Int, filePath: String, topK: Int ->
      val tagger = audioTaggingEngines[handle]
        ?: throw IllegalArgumentException("Invalid AudioTagging handle: $handle")
      Log.i(TAG, "=== audioTaggingComputeFromFile START ===")
      val waveData = WaveReader.readWave(filePath)
      val stream = tagger.createStream()
      stream.acceptWaveform(waveData.samples, waveData.sampleRate)
      val events = tagger.compute(stream, topK)
      stream.release()
      Log.i(TAG, "=== audioTaggingComputeFromFile DONE ${events.size} events ===")
      events.map { ev ->
        mapOf("name" to ev.name, "index" to ev.index, "prob" to ev.prob.toDouble())
      }
    }

    AsyncFunction("destroyAudioTagging") { handle: Int ->
      Log.i(TAG, "=== destroyAudioTagging handle=$handle ===")
      val tagger = audioTaggingEngines.remove(handle)
      if (tagger != null) {
        try { tagger.release() } catch (e: Exception) {
          Log.e(TAG, "  AudioTagging release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Punctuation (Offline + Online)
    // =========================================================================

    AsyncFunction("createOfflinePunctuation") { config: Map<String, Any?> ->
      val modelMap = config["model"] as? Map<String, Any?> ?: emptyMap()
      val punctConfig = OfflinePunctuationConfig(
        model = OfflinePunctuationModelConfig(
          ctTransformer = modelMap["ctTransformer"] as? String ?: "",
          numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 1,
          debug = modelMap["debug"] as? Boolean ?: false,
          provider = modelMap["provider"] as? String ?: "cpu",
        ),
      )
      Log.i(TAG, "=== createOfflinePunctuation START ===")
      val punct = try {
        OfflinePunctuation(config = punctConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  OfflinePunctuation constructor threw: ${e.message}", e)
        throw Exception("Native OfflinePunctuation creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      offlinePunctuationEngines[handle] = punct
      Log.i(TAG, "=== createOfflinePunctuation DONE handle=$handle ===")
      handle
    }

    AsyncFunction("offlinePunctuationAddPunct") { handle: Int, text: String ->
      val punct = offlinePunctuationEngines[handle]
        ?: throw IllegalArgumentException("Invalid OfflinePunctuation handle: $handle")
      punct.addPunctuation(text)
    }

    AsyncFunction("destroyOfflinePunctuation") { handle: Int ->
      Log.i(TAG, "=== destroyOfflinePunctuation handle=$handle ===")
      val punct = offlinePunctuationEngines.remove(handle)
      if (punct != null) {
        try { punct.release() } catch (e: Exception) {
          Log.e(TAG, "  OfflinePunctuation release() threw: ${e.message}", e)
        }
      }
    }

    AsyncFunction("createOnlinePunctuation") { config: Map<String, Any?> ->
      val modelMap = config["model"] as? Map<String, Any?> ?: emptyMap()
      val punctConfig = OnlinePunctuationConfig(
        model = OnlinePunctuationModelConfig(
          cnnBilstm = modelMap["cnnBilstm"] as? String ?: "",
          bpeVocab = modelMap["bpeVocab"] as? String ?: "",
          numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 1,
          debug = modelMap["debug"] as? Boolean ?: false,
          provider = modelMap["provider"] as? String ?: "cpu",
        ),
      )
      Log.i(TAG, "=== createOnlinePunctuation START ===")
      val punct = try {
        OnlinePunctuation(config = punctConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  OnlinePunctuation constructor threw: ${e.message}", e)
        throw Exception("Native OnlinePunctuation creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      onlinePunctuationEngines[handle] = punct
      Log.i(TAG, "=== createOnlinePunctuation DONE handle=$handle ===")
      handle
    }

    AsyncFunction("onlinePunctuationAddPunct") { handle: Int, text: String ->
      val punct = onlinePunctuationEngines[handle]
        ?: throw IllegalArgumentException("Invalid OnlinePunctuation handle: $handle")
      punct.addPunctuation(text)
    }

    AsyncFunction("destroyOnlinePunctuation") { handle: Int ->
      Log.i(TAG, "=== destroyOnlinePunctuation handle=$handle ===")
      val punct = onlinePunctuationEngines.remove(handle)
      if (punct != null) {
        try { punct.release() } catch (e: Exception) {
          Log.e(TAG, "  OnlinePunctuation release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // Speech Denoising (Offline + Online)
    // =========================================================================

    @Suppress("UNCHECKED_CAST")
    AsyncFunction("createOfflineSpeechDenoiser") { config: Map<String, Any?> ->
      val modelMap = config["model"] as? Map<String, Any?> ?: emptyMap()
      val gtcrnMap = modelMap["gtcrn"] as? Map<String, Any?> ?: emptyMap()
      val dpdfnetMap = modelMap["dpdfnet"] as? Map<String, Any?> ?: emptyMap()
      val denoiserConfig = OfflineSpeechDenoiserConfig(
        model = OfflineSpeechDenoiserModelConfig(
          gtcrn = OfflineSpeechDenoiserGtcrnModelConfig(
            model = gtcrnMap["model"] as? String ?: "",
          ),
          dpdfnet = OfflineSpeechDenoiserDpdfNetModelConfig(
            model = dpdfnetMap["model"] as? String ?: "",
          ),
          numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 1,
          debug = modelMap["debug"] as? Boolean ?: false,
          provider = modelMap["provider"] as? String ?: "cpu",
        ),
      )
      Log.i(TAG, "=== createOfflineSpeechDenoiser START ===")
      val denoiser = try {
        OfflineSpeechDenoiser(config = denoiserConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  OfflineSpeechDenoiser constructor threw: ${e.message}", e)
        throw Exception("Native OfflineSpeechDenoiser creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      offlineSpeechDenoiserEngines[handle] = denoiser
      Log.i(TAG, "=== createOfflineSpeechDenoiser DONE handle=$handle sampleRate=${denoiser.sampleRate} ===")
      handle
    }

    AsyncFunction("offlineSpeechDenoiserRun") { handle: Int, samples: List<Double>, sampleRate: Int ->
      val denoiser = offlineSpeechDenoiserEngines[handle]
        ?: throw IllegalArgumentException("Invalid OfflineSpeechDenoiser handle: $handle")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      val result = denoiser.run(floatSamples, sampleRate)
      mapOf(
        "samples" to result.samples.map { it.toDouble() },
        "sampleRate" to result.sampleRate,
      )
    }

    AsyncFunction("offlineSpeechDenoiserRunFromFile") { handle: Int, filePath: String ->
      val denoiser = offlineSpeechDenoiserEngines[handle]
        ?: throw IllegalArgumentException("Invalid OfflineSpeechDenoiser handle: $handle")
      Log.i(TAG, "=== offlineSpeechDenoiserRunFromFile START ===")
      val waveData = WaveReader.readWave(filePath)
      val result = denoiser.run(waveData.samples, waveData.sampleRate)
      Log.i(TAG, "=== offlineSpeechDenoiserRunFromFile DONE ${result.samples.size} samples ===")
      mapOf(
        "samples" to result.samples.map { it.toDouble() },
        "sampleRate" to result.sampleRate,
      )
    }

    AsyncFunction("offlineSpeechDenoiserSaveToFile") { handle: Int, inputPath: String, outputPath: String ->
      val denoiser = offlineSpeechDenoiserEngines[handle]
        ?: throw IllegalArgumentException("Invalid OfflineSpeechDenoiser handle: $handle")
      Log.i(TAG, "=== offlineSpeechDenoiserSaveToFile START ===")
      val waveData = WaveReader.readWave(inputPath)
      val result = denoiser.run(waveData.samples, waveData.sampleRate)
      val saved = result.save(outputPath)
      Log.i(TAG, "=== offlineSpeechDenoiserSaveToFile DONE saved=$saved ===")
      mapOf(
        "outputPath" to outputPath,
        "sampleRate" to result.sampleRate,
      )
    }

    AsyncFunction("destroyOfflineSpeechDenoiser") { handle: Int ->
      Log.i(TAG, "=== destroyOfflineSpeechDenoiser handle=$handle ===")
      val denoiser = offlineSpeechDenoiserEngines.remove(handle)
      if (denoiser != null) {
        try { denoiser.release() } catch (e: Exception) {
          Log.e(TAG, "  OfflineSpeechDenoiser release() threw: ${e.message}", e)
        }
      }
    }

    @Suppress("UNCHECKED_CAST")
    AsyncFunction("createOnlineSpeechDenoiser") { config: Map<String, Any?> ->
      val modelMap = config["model"] as? Map<String, Any?> ?: emptyMap()
      val gtcrnMap = modelMap["gtcrn"] as? Map<String, Any?> ?: emptyMap()
      val dpdfnetMap = modelMap["dpdfnet"] as? Map<String, Any?> ?: emptyMap()
      val denoiserConfig = OnlineSpeechDenoiserConfig(
        model = OfflineSpeechDenoiserModelConfig(
          gtcrn = OfflineSpeechDenoiserGtcrnModelConfig(
            model = gtcrnMap["model"] as? String ?: "",
          ),
          dpdfnet = OfflineSpeechDenoiserDpdfNetModelConfig(
            model = dpdfnetMap["model"] as? String ?: "",
          ),
          numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 1,
          debug = modelMap["debug"] as? Boolean ?: false,
          provider = modelMap["provider"] as? String ?: "cpu",
        ),
      )
      Log.i(TAG, "=== createOnlineSpeechDenoiser START ===")
      val denoiser = try {
        OnlineSpeechDenoiser(config = denoiserConfig)
      } catch (e: Exception) {
        Log.e(TAG, "  OnlineSpeechDenoiser constructor threw: ${e.message}", e)
        throw Exception("Native OnlineSpeechDenoiser creation failed: ${e.message}")
      }
      val handle = handleCounter.incrementAndGet()
      onlineSpeechDenoiserEngines[handle] = denoiser
      Log.i(TAG, "=== createOnlineSpeechDenoiser DONE handle=$handle sampleRate=${denoiser.sampleRate} ===")
      handle
    }

    AsyncFunction("onlineSpeechDenoiserRun") { handle: Int, samples: List<Double>, sampleRate: Int ->
      val denoiser = onlineSpeechDenoiserEngines[handle]
        ?: throw IllegalArgumentException("Invalid OnlineSpeechDenoiser handle: $handle")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      val result = denoiser.run(floatSamples, sampleRate)
      mapOf(
        "samples" to result.samples.map { it.toDouble() },
        "sampleRate" to result.sampleRate,
      )
    }

    AsyncFunction("onlineSpeechDenoiserFlush") { handle: Int ->
      val denoiser = onlineSpeechDenoiserEngines[handle]
        ?: throw IllegalArgumentException("Invalid OnlineSpeechDenoiser handle: $handle")
      val result = denoiser.flush()
      mapOf(
        "samples" to result.samples.map { it.toDouble() },
        "sampleRate" to result.sampleRate,
      )
    }

    AsyncFunction("destroyOnlineSpeechDenoiser") { handle: Int ->
      Log.i(TAG, "=== destroyOnlineSpeechDenoiser handle=$handle ===")
      val denoiser = onlineSpeechDenoiserEngines.remove(handle)
      if (denoiser != null) {
        try { denoiser.release() } catch (e: Exception) {
          Log.e(TAG, "  OnlineSpeechDenoiser release() threw: ${e.message}", e)
        }
      }
    }

    // =========================================================================
    // File Utilities
    // =========================================================================

    AsyncFunction("saveAudioToFile") { samples: List<Double>, sampleRate: Int, filePath: String ->
      Log.i(TAG, "=== saveAudioToFile START filePath=$filePath ===")
      val floatSamples = FloatArray(samples.size) { samples[it].toFloat() }
      val audio = DenoisedAudio(floatSamples, sampleRate)
      val saved = audio.save(filePath)
      Log.i(TAG, "=== saveAudioToFile DONE saved=$saved ===")
      saved
    }

    AsyncFunction("shareAudioFile") { filePath: String, mimeType: String ->
      Log.i(TAG, "=== shareAudioFile START filePath=$filePath ===")
      val context = appContext.reactContext ?: throw IllegalStateException("React context not available")
      val file = File(filePath)
      if (!file.exists()) throw IllegalArgumentException("File not found: $filePath")
      val uri = androidx.core.content.FileProvider.getUriForFile(
        context,
        "${context.packageName}.fileprovider",
        file
      )
      val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = mimeType.ifBlank { "audio/wav" }
        putExtra(android.content.Intent.EXTRA_STREAM, uri)
        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(android.content.Intent.createChooser(intent, "Share Audio").apply {
        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      })
      Log.i(TAG, "=== shareAudioFile DONE ===")
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
    Log.i(TAG, "  [file] $label OK ($path, ${f.length()} bytes)")
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

  private fun requireDir(path: String, label: String) {
    if (path.isBlank()) return
    val f = File(path)
    if (!f.exists()) throw Exception("$label directory not found: $path")
    if (!f.isDirectory) throw Exception("$label is not a directory: $path")
    val count = f.listFiles()?.size ?: 0
    if (count == 0) throw Exception("$label directory is empty: $path")
    Log.i(TAG, "  [dir] $label OK ($path, $count items)")
  }

  private fun validateTtsConfig(c: OfflineTtsConfig) {
    val vits = c.model.vits
    val matcha = c.model.matcha
    val kokoro = c.model.kokoro
    val zipvoice = c.model.zipvoice
    val kitten = c.model.kitten
    val pocket = c.model.pocket
    val supertonic = c.model.supertonic

    val hasVits = vits.model.isNotBlank()
    val hasMatcha = matcha.acousticModel.isNotBlank()
    val hasKokoro = kokoro.model.isNotBlank()
    val hasZipVoice = zipvoice.encoder.isNotBlank()
    val hasKitten = kitten.model.isNotBlank()
    val hasPocket = pocket.lmMain.isNotBlank()
    val hasSupertonic = supertonic.textEncoder.isNotBlank()

    Log.i(TAG, "  validateTts: vits=${hasVits} matcha=${hasMatcha} kokoro=${hasKokoro} zipvoice=${hasZipVoice} kitten=${hasKitten} pocket=${hasPocket} supertonic=${hasSupertonic}")

    if (!hasVits && !hasMatcha && !hasKokoro && !hasZipVoice && !hasKitten && !hasPocket && !hasSupertonic) {
      throw Exception("No TTS model files specified. Provide at least one model type (vits, matcha, kokoro, zipvoice, kitten, pocket, or supertonic).")
    }

    if (hasVits) {
      Log.i(TAG, "  Validating VITS: model=${vits.model} tokens=${vits.tokens} lexicon=${vits.lexicon} dataDir=${vits.dataDir} dictDir=${vits.dictDir}")
      requireFile(vits.model, "vits model")
      if (vits.tokens.isNotBlank()) requireFile(vits.tokens, "vits tokens")
      if (vits.lexicon.isNotBlank()) requireFile(vits.lexicon, "vits lexicon")
      if (vits.dataDir.isNotBlank()) requireDir(vits.dataDir, "vits dataDir")
      if (vits.dictDir.isNotBlank()) requireDir(vits.dictDir, "vits dictDir")
    }
    if (hasMatcha) {
      Log.i(TAG, "  Validating Matcha: acousticModel=${matcha.acousticModel} vocoder=${matcha.vocoder} tokens=${matcha.tokens} dataDir=${matcha.dataDir}")
      requireFile(matcha.acousticModel, "matcha acousticModel")
      requireFile(matcha.vocoder, "matcha vocoder")
      if (matcha.tokens.isNotBlank()) requireFile(matcha.tokens, "matcha tokens")
      if (matcha.lexicon.isNotBlank()) requireFile(matcha.lexicon, "matcha lexicon")
      if (matcha.dataDir.isNotBlank()) requireDir(matcha.dataDir, "matcha dataDir")
      if (matcha.dictDir.isNotBlank()) requireDir(matcha.dictDir, "matcha dictDir")
    }
    if (hasKokoro) {
      Log.i(TAG, "  Validating Kokoro: model=${kokoro.model} voices=${kokoro.voices} tokens=${kokoro.tokens} dataDir=${kokoro.dataDir}")
      requireFile(kokoro.model, "kokoro model")
      if (kokoro.voices.isNotBlank()) requireFile(kokoro.voices, "kokoro voices")
      if (kokoro.tokens.isNotBlank()) requireFile(kokoro.tokens, "kokoro tokens")
      if (kokoro.dataDir.isNotBlank()) requireDir(kokoro.dataDir, "kokoro dataDir")
      if (kokoro.dictDir.isNotBlank()) requireDir(kokoro.dictDir, "kokoro dictDir")
    }
    if (hasZipVoice) {
      Log.i(TAG, "  Validating ZipVoice: encoder=${zipvoice.encoder} decoder=${zipvoice.decoder} vocoder=${zipvoice.vocoder}")
      requireFile(zipvoice.encoder, "zipvoice encoder")
      requireFile(zipvoice.decoder, "zipvoice decoder")
      requireFile(zipvoice.vocoder, "zipvoice vocoder")
      if (zipvoice.tokens.isNotBlank()) requireFile(zipvoice.tokens, "zipvoice tokens")
      if (zipvoice.dataDir.isNotBlank()) requireDir(zipvoice.dataDir, "zipvoice dataDir")
    }
    if (hasKitten) {
      Log.i(TAG, "  Validating Kitten: model=${kitten.model} voices=${kitten.voices} tokens=${kitten.tokens}")
      requireFile(kitten.model, "kitten model")
      if (kitten.voices.isNotBlank()) requireFile(kitten.voices, "kitten voices")
      if (kitten.tokens.isNotBlank()) requireFile(kitten.tokens, "kitten tokens")
      if (kitten.dataDir.isNotBlank()) requireDir(kitten.dataDir, "kitten dataDir")
    }
    if (hasPocket) {
      Log.i(TAG, "  Validating Pocket: lmMain=${pocket.lmMain} lmFlow=${pocket.lmFlow}")
      requireFile(pocket.lmMain, "pocket lmMain")
      requireFile(pocket.lmFlow, "pocket lmFlow")
      requireFile(pocket.encoder, "pocket encoder")
      requireFile(pocket.decoder, "pocket decoder")
      requireFile(pocket.textConditioner, "pocket textConditioner")
      if (pocket.vocabJson.isNotBlank()) requireFile(pocket.vocabJson, "pocket vocabJson")
      if (pocket.tokenScoresJson.isNotBlank()) requireFile(pocket.tokenScoresJson, "pocket tokenScoresJson")
    }
    if (hasSupertonic) {
      Log.i(TAG, "  Validating Supertonic: textEncoder=${supertonic.textEncoder}")
      requireFile(supertonic.textEncoder, "supertonic textEncoder")
      requireFile(supertonic.durationPredictor, "supertonic durationPredictor")
      requireFile(supertonic.vectorEstimator, "supertonic vectorEstimator")
      requireFile(supertonic.vocoder, "supertonic vocoder")
      if (supertonic.ttsJson.isNotBlank()) requireFile(supertonic.ttsJson, "supertonic ttsJson")
      if (supertonic.unicodeIndexer.isNotBlank()) requireFile(supertonic.unicodeIndexer, "supertonic unicodeIndexer")
    }

    Log.i(TAG, "TTS config validated OK")
  }

  @Suppress("UNCHECKED_CAST")
  private fun buildOfflineTtsConfig(config: Map<String, Any?>): OfflineTtsConfig {
    val modelMap = config["model"] as? Map<String, Any?> ?: emptyMap()

    val vitsMap = modelMap["vits"] as? Map<String, Any?> ?: emptyMap()
    val matchaMap = modelMap["matcha"] as? Map<String, Any?> ?: emptyMap()
    val kokoroMap = modelMap["kokoro"] as? Map<String, Any?> ?: emptyMap()
    val zipvoiceMap = modelMap["zipvoice"] as? Map<String, Any?> ?: emptyMap()
    val kittenMap = modelMap["kitten"] as? Map<String, Any?> ?: emptyMap()
    val pocketMap = modelMap["pocket"] as? Map<String, Any?> ?: emptyMap()
    val supertonicMap = modelMap["supertonic"] as? Map<String, Any?> ?: emptyMap()

    return OfflineTtsConfig(
      model = OfflineTtsModelConfig(
        vits = OfflineTtsVitsModelConfig(
          model = vitsMap["model"] as? String ?: "",
          lexicon = vitsMap["lexicon"] as? String ?: "",
          tokens = vitsMap["tokens"] as? String ?: "",
          dataDir = vitsMap["dataDir"] as? String ?: "",
          dictDir = vitsMap["dictDir"] as? String ?: "",
          noiseScale = (vitsMap["noiseScale"] as? Number)?.toFloat() ?: 0.667f,
          noiseScaleW = (vitsMap["noiseScaleW"] as? Number)?.toFloat() ?: 0.8f,
          lengthScale = (vitsMap["lengthScale"] as? Number)?.toFloat() ?: 1.0f,
        ),
        matcha = OfflineTtsMatchaModelConfig(
          acousticModel = matchaMap["acousticModel"] as? String ?: "",
          vocoder = matchaMap["vocoder"] as? String ?: "",
          lexicon = matchaMap["lexicon"] as? String ?: "",
          tokens = matchaMap["tokens"] as? String ?: "",
          dataDir = matchaMap["dataDir"] as? String ?: "",
          dictDir = matchaMap["dictDir"] as? String ?: "",
          noiseScale = (matchaMap["noiseScale"] as? Number)?.toFloat() ?: 1.0f,
          lengthScale = (matchaMap["lengthScale"] as? Number)?.toFloat() ?: 1.0f,
        ),
        kokoro = OfflineTtsKokoroModelConfig(
          model = kokoroMap["model"] as? String ?: "",
          voices = kokoroMap["voices"] as? String ?: "",
          tokens = kokoroMap["tokens"] as? String ?: "",
          dataDir = kokoroMap["dataDir"] as? String ?: "",
          lexicon = kokoroMap["lexicon"] as? String ?: "",
          lang = kokoroMap["lang"] as? String ?: "",
          dictDir = kokoroMap["dictDir"] as? String ?: "",
          lengthScale = (kokoroMap["lengthScale"] as? Number)?.toFloat() ?: 1.0f,
        ),
        zipvoice = OfflineTtsZipVoiceModelConfig(
          tokens = zipvoiceMap["tokens"] as? String ?: "",
          encoder = zipvoiceMap["encoder"] as? String ?: "",
          decoder = zipvoiceMap["decoder"] as? String ?: "",
          vocoder = zipvoiceMap["vocoder"] as? String ?: "",
          dataDir = zipvoiceMap["dataDir"] as? String ?: "",
          lexicon = zipvoiceMap["lexicon"] as? String ?: "",
          featScale = (zipvoiceMap["featScale"] as? Number)?.toFloat() ?: 0.1f,
          tShift = (zipvoiceMap["tShift"] as? Number)?.toFloat() ?: 0.5f,
          targetRms = (zipvoiceMap["targetRms"] as? Number)?.toFloat() ?: 0.1f,
          guidanceScale = (zipvoiceMap["guidanceScale"] as? Number)?.toFloat() ?: 1.0f,
        ),
        kitten = OfflineTtsKittenModelConfig(
          model = kittenMap["model"] as? String ?: "",
          voices = kittenMap["voices"] as? String ?: "",
          tokens = kittenMap["tokens"] as? String ?: "",
          dataDir = kittenMap["dataDir"] as? String ?: "",
          lengthScale = (kittenMap["lengthScale"] as? Number)?.toFloat() ?: 1.0f,
        ),
        pocket = OfflineTtsPocketModelConfig(
          lmFlow = pocketMap["lmFlow"] as? String ?: "",
          lmMain = pocketMap["lmMain"] as? String ?: "",
          encoder = pocketMap["encoder"] as? String ?: "",
          decoder = pocketMap["decoder"] as? String ?: "",
          textConditioner = pocketMap["textConditioner"] as? String ?: "",
          vocabJson = pocketMap["vocabJson"] as? String ?: "",
          tokenScoresJson = pocketMap["tokenScoresJson"] as? String ?: "",
          voiceEmbeddingCacheCapacity = (pocketMap["voiceEmbeddingCacheCapacity"] as? Number)?.toInt() ?: 50,
        ),
        supertonic = OfflineTtsSupertonicModelConfig(
          durationPredictor = supertonicMap["durationPredictor"] as? String ?: "",
          textEncoder = supertonicMap["textEncoder"] as? String ?: "",
          vectorEstimator = supertonicMap["vectorEstimator"] as? String ?: "",
          vocoder = supertonicMap["vocoder"] as? String ?: "",
          ttsJson = supertonicMap["ttsJson"] as? String ?: "",
          unicodeIndexer = supertonicMap["unicodeIndexer"] as? String ?: "",
          voiceStyle = supertonicMap["voiceStyle"] as? String ?: "",
        ),
        numThreads = (modelMap["numThreads"] as? Number)?.toInt() ?: 2,
        debug = modelMap["debug"] as? Boolean ?: false,
        provider = modelMap["provider"] as? String ?: "cpu",
      ),
      ruleFsts = config["ruleFsts"] as? String ?: "",
      ruleFars = config["ruleFars"] as? String ?: "",
      maxNumSentences = (config["maxNumSentences"] as? Number)?.toInt() ?: 1,
      silenceScale = (config["silenceScale"] as? Number)?.toFloat() ?: 0.2f,
    )
  }

  @Suppress("UNCHECKED_CAST")
  private fun buildVadModelConfig(config: Map<String, Any?>): VadModelConfig {
    val sileroMap = config["sileroVadModelConfig"] as? Map<String, Any?> ?: emptyMap()
    val tenMap = config["tenVadModelConfig"] as? Map<String, Any?> ?: emptyMap()

    return VadModelConfig(
      sileroVadModelConfig = SileroVadModelConfig(
        model = sileroMap["model"] as? String ?: "",
        threshold = (sileroMap["threshold"] as? Number)?.toFloat() ?: 0.5f,
        minSilenceDuration = (sileroMap["minSilenceDuration"] as? Number)?.toFloat() ?: 0.25f,
        minSpeechDuration = (sileroMap["minSpeechDuration"] as? Number)?.toFloat() ?: 0.25f,
        windowSize = (sileroMap["windowSize"] as? Number)?.toInt() ?: 512,
        maxSpeechDuration = (sileroMap["maxSpeechDuration"] as? Number)?.toFloat() ?: 5.0f,
      ),
      tenVadModelConfig = TenVadModelConfig(
        model = tenMap["model"] as? String ?: "",
        threshold = (tenMap["threshold"] as? Number)?.toFloat() ?: 0.5f,
        minSilenceDuration = (tenMap["minSilenceDuration"] as? Number)?.toFloat() ?: 0.25f,
        minSpeechDuration = (tenMap["minSpeechDuration"] as? Number)?.toFloat() ?: 0.25f,
        windowSize = (tenMap["windowSize"] as? Number)?.toInt() ?: 256,
        maxSpeechDuration = (tenMap["maxSpeechDuration"] as? Number)?.toFloat() ?: 5.0f,
      ),
      sampleRate = (config["sampleRate"] as? Number)?.toInt() ?: 16000,
      numThreads = (config["numThreads"] as? Number)?.toInt() ?: 1,
      provider = config["provider"] as? String ?: "cpu",
      debug = config["debug"] as? Boolean ?: false,
    )
  }

  private fun validateVadConfig(c: VadModelConfig) {
    val hasSilero = c.sileroVadModelConfig.model.isNotBlank()
    val hasTen = c.tenVadModelConfig.model.isNotBlank()
    if (!hasSilero && !hasTen) {
      throw Exception("No VAD model specified. Provide either sileroVadModelConfig.model or tenVadModelConfig.model.")
    }
    if (hasSilero) {
      requireFile(c.sileroVadModelConfig.model, "silero VAD model")
    }
    if (hasTen) {
      requireFile(c.tenVadModelConfig.model, "ten VAD model")
    }
    Log.i(TAG, "VAD config validated OK")
  }

  @Suppress("UNCHECKED_CAST")
  private fun buildKeywordSpotterConfig(config: Map<String, Any?>): KeywordSpotterConfig {
    val modelMap = config["modelConfig"] as? Map<String, Any?> ?: emptyMap()
    val featMap = config["featConfig"] as? Map<String, Any?> ?: emptyMap()
    val transducerMap = modelMap["transducer"] as? Map<String, Any?> ?: emptyMap()

    return KeywordSpotterConfig(
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
          encoder = (modelMap["paraformer"] as? Map<String, Any?>)?.get("encoder") as? String ?: "",
          decoder = (modelMap["paraformer"] as? Map<String, Any?>)?.get("decoder") as? String ?: "",
        ),
        zipformer2Ctc = OnlineZipformer2CtcModelConfig(
          model = (modelMap["zipformer2Ctc"] as? Map<String, Any?>)?.get("model") as? String ?: "",
        ),
      ),
      maxActivePaths = (config["maxActivePaths"] as? Number)?.toInt() ?: 4,
      keywordsFile = config["keywordsFile"] as? String ?: "",
      keywordsScore = (config["keywordsScore"] as? Number)?.toFloat() ?: 1.5f,
      keywordsThreshold = (config["keywordsThreshold"] as? Number)?.toFloat() ?: 0.25f,
      numTrailingBlanks = (config["numTrailingBlanks"] as? Number)?.toInt() ?: 2,
    )
  }

  private fun validateKwsConfig(c: KeywordSpotterConfig) {
    requireFile(c.modelConfig.tokens, "KWS tokens")

    val t = c.modelConfig.transducer
    val hasTransducer = t.encoder.isNotBlank() || t.decoder.isNotBlank() || t.joiner.isNotBlank()
    if (!hasTransducer) {
      throw Exception("Keyword spotting requires a transducer model (encoder + decoder + joiner).")
    }
    requireFile(t.encoder, "KWS transducer encoder")
    requireFile(t.decoder, "KWS transducer decoder")
    requireFile(t.joiner, "KWS transducer joiner")

    if (c.keywordsFile.isNotBlank()) {
      requireFile(c.keywordsFile, "keywords file")
    }

    Log.i(TAG, "KWS config validated OK")
  }

  @Suppress("UNCHECKED_CAST")
  private fun buildOfflineSpeakerDiarizationConfig(config: Map<String, Any?>): OfflineSpeakerDiarizationConfig {
    val segMap = config["segmentation"] as? Map<String, Any?> ?: emptyMap()
    val embMap = config["embedding"] as? Map<String, Any?> ?: emptyMap()
    val clusterMap = config["clustering"] as? Map<String, Any?> ?: emptyMap()

    val pyannoteMap = segMap["pyannote"] as? Map<String, Any?> ?: emptyMap()

    return OfflineSpeakerDiarizationConfig(
      segmentation = OfflineSpeakerSegmentationModelConfig(
        pyannote = OfflineSpeakerSegmentationPyannoteModelConfig(
          model = pyannoteMap["model"] as? String ?: "",
        ),
        numThreads = (segMap["numThreads"] as? Number)?.toInt() ?: 1,
        debug = segMap["debug"] as? Boolean ?: false,
        provider = segMap["provider"] as? String ?: "cpu",
      ),
      embedding = SpeakerEmbeddingExtractorConfig(
        model = embMap["model"] as? String ?: "",
        numThreads = (embMap["numThreads"] as? Number)?.toInt() ?: 1,
        debug = embMap["debug"] as? Boolean ?: false,
        provider = embMap["provider"] as? String ?: "cpu",
      ),
      clustering = FastClusteringConfig(
        numClusters = (clusterMap["numClusters"] as? Number)?.toInt() ?: -1,
        threshold = (clusterMap["threshold"] as? Number)?.toFloat() ?: 0.5f,
      ),
      minDurationOn = (config["minDurationOn"] as? Number)?.toFloat() ?: 0.2f,
      minDurationOff = (config["minDurationOff"] as? Number)?.toFloat() ?: 0.5f,
    )
  }
}
