package expo.modules.sherpaonnx

import com.k2fsa.sherpa.onnx.VersionInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoSherpaOnnxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoSherpaOnnx")

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
  }
}
