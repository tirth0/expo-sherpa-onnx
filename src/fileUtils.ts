import ExpoSherpaOnnxModule from "./ExpoSherpaOnnxModule";

export async function saveAudioToFile(
  samples: number[],
  sampleRate: number,
  filePath: string
): Promise<boolean> {
  return ExpoSherpaOnnxModule.saveAudioToFile(samples, sampleRate, filePath);
}

export async function shareAudioFile(
  filePath: string,
  mimeType = "audio/wav"
): Promise<void> {
  return ExpoSherpaOnnxModule.shareAudioFile(filePath, mimeType);
}
