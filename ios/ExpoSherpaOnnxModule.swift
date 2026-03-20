import ExpoModulesCore
import csherpa

public class ExpoSherpaOnnxModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSherpaOnnx")

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
  }
}
