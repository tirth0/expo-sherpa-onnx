package com.k2fsa.sherpa.onnx

class OnlineStream(var ptr: Long = 0) {
    fun acceptWaveform(samples: FloatArray, sampleRate: Int) = synchronized(this) {
        if (ptr != 0L) acceptWaveform(ptr, samples, sampleRate)
    }

    fun inputFinished() = synchronized(this) {
        if (ptr != 0L) inputFinished(ptr)
    }

    fun setOption(key: String, value: String) = synchronized(this) {
        if (ptr != 0L) setOption(ptr, key, value)
    }

    fun getOption(key: String): String = synchronized(this) {
        if (ptr == 0L) return ""
        return getOption(ptr, key)
    }

    protected fun finalize() {
        synchronized(this) {
            if (ptr != 0L) {
                delete(ptr)
                ptr = 0
            }
        }
    }

    fun release() = finalize()

    fun use(block: (OnlineStream) -> Unit) {
        try {
            block(this)
        } finally {
            release()
        }
    }

    private external fun acceptWaveform(ptr: Long, samples: FloatArray, sampleRate: Int)
    private external fun inputFinished(ptr: Long)
    private external fun setOption(ptr: Long, key: String, value: String)
    private external fun getOption(ptr: Long, key: String): String
    private external fun delete(ptr: Long)


    companion object {
        init {
            System.loadLibrary("sherpa-onnx-jni")
        }
    }
}
