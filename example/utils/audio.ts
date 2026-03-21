import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';

export function base64ToFloat32(base64: string): number[] {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32: number[] = new Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

const SUPPORTED_RATES = [16000, 44100, 48000] as const;

export function pickPlaybackRate(sampleRate: number): number {
  if ((SUPPORTED_RATES as readonly number[]).includes(sampleRate)) return sampleRate;
  for (const r of SUPPORTED_RATES) {
    if (r % sampleRate === 0 || sampleRate % r === 0) return r;
  }
  return 44100;
}

export function resampleNearest(samples: number[], srcRate: number, dstRate: number): number[] {
  if (srcRate === dstRate) return samples;
  const ratio = dstRate / srcRate;
  const outLen = Math.round(samples.length * ratio);
  const out = new Array<number>(outLen);
  for (let i = 0; i < outLen; i++) {
    out[i] = samples[Math.min(Math.floor(i / ratio), samples.length - 1)];
  }
  return out;
}

export function float32ToPcm16Base64(samples: number[]): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const PLAY_CHUNK_SIZE = 4096;
let activeTurnId: string | null = null;

export async function playTtsAudio(samples: number[], sampleRate: number): Promise<void> {
  const targetRate = pickPlaybackRate(sampleRate);
  const resampled = resampleNearest(samples, sampleRate, targetRate);
  const turnId = `tts-play-${Date.now()}`;
  activeTurnId = turnId;

  await ExpoPlayAudioStream.startBufferedAudioStream({
    turnId,
    encoding: 'pcm_s16le',
  });

  for (let offset = 0; offset < resampled.length; offset += PLAY_CHUNK_SIZE) {
    if (activeTurnId !== turnId) break;
    const chunk = resampled.slice(offset, offset + PLAY_CHUNK_SIZE);
    const pcmBase64 = float32ToPcm16Base64(chunk);
    const isFirst = offset === 0;
    const isFinal = offset + PLAY_CHUNK_SIZE >= resampled.length;
    await ExpoPlayAudioStream.playAudioBuffered(pcmBase64, turnId, isFirst, isFinal);
  }
}

export async function stopTtsAudio(): Promise<void> {
  const turnId = activeTurnId;
  activeTurnId = null;
  if (turnId) {
    try { await ExpoPlayAudioStream.stopBufferedAudioStream(turnId); } catch (_) {}
  }
  try { await ExpoPlayAudioStream.stopAudio(); } catch (_) {}
}

export async function startTtsStream(sampleRate: number): Promise<string> {
  const targetRate = pickPlaybackRate(sampleRate);
  const turnId = `tts-stream-${Date.now()}`;
  activeTurnId = turnId;
  await ExpoPlayAudioStream.startBufferedAudioStream({
    turnId,
    encoding: 'pcm_s16le',
  });
  return turnId;
}

export async function feedTtsChunk(
  turnId: string,
  chunkSamples: number[],
  srcRate: number,
  dstRate: number,
  isFirst: boolean
): Promise<void> {
  if (activeTurnId !== turnId) return;
  const resampled = resampleNearest(chunkSamples, srcRate, dstRate);
  const pcmBase64 = float32ToPcm16Base64(resampled);
  await ExpoPlayAudioStream.playAudioBuffered(pcmBase64, turnId, isFirst, false);
}

export async function finishTtsStream(turnId: string): Promise<void> {
  if (activeTurnId !== turnId) return;
  const silence = float32ToPcm16Base64([0, 0, 0, 0]);
  await ExpoPlayAudioStream.playAudioBuffered(silence, turnId, false, true);
  activeTurnId = null;
}
