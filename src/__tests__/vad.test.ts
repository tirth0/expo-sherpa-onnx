/// <reference types="jest" />
import { createVAD } from '../vad';

describe('VAD (createVAD)', () => {
  it('creates a VAD engine with a valid handle', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: {
        model: '/mock/silero_vad.onnx',
      },
    });
    expect(vad.handle).toBeGreaterThan(0);
    await vad.destroy();
  });

  it('acceptWaveform does not throw', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: { model: '/mock/silero_vad.onnx' },
    });
    await expect(
      vad.acceptWaveform([0.0, 0.1, -0.1, 0.05, 0.0])
    ).resolves.not.toThrow();
    await vad.destroy();
  });

  it('front returns a segment with start and samples', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: { model: '/mock/silero_vad.onnx' },
    });
    await vad.acceptWaveform([0.1, 0.2, 0.3]);
    const isEmpty = await vad.empty();
    if (!isEmpty) {
      const segment = await vad.front();
      expect(typeof segment.start).toBe('number');
      expect(Array.isArray(segment.samples)).toBe(true);
      expect(segment.samples.length).toBeGreaterThan(0);
      await vad.pop();
    }
    await vad.destroy();
  });

  it('isSpeechDetected returns a boolean', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: { model: '/mock/silero_vad.onnx' },
    });
    const detected = await vad.isSpeechDetected();
    expect(typeof detected).toBe('boolean');
    await vad.destroy();
  });

  it('reset and clear do not throw', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: { model: '/mock/silero_vad.onnx' },
    });
    await expect(vad.reset()).resolves.not.toThrow();
    await expect(vad.clear()).resolves.not.toThrow();
    await vad.destroy();
  });

  it('flush does not throw', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: { model: '/mock/silero_vad.onnx' },
    });
    await expect(vad.flush()).resolves.not.toThrow();
    await vad.destroy();
  });

  it('throws after destroy', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: { model: '/mock/silero_vad.onnx' },
    });
    await vad.destroy();
    await expect(vad.acceptWaveform([0.1])).rejects.toThrow('destroyed');
    await expect(vad.empty()).rejects.toThrow('destroyed');
    await expect(vad.front()).rejects.toThrow('destroyed');
    await expect(vad.reset()).rejects.toThrow('destroyed');
  });

  it('double destroy is safe', async () => {
    const vad = await createVAD({
      sileroVadModelConfig: { model: '/mock/silero_vad.onnx' },
    });
    await vad.destroy();
    await expect(vad.destroy()).resolves.not.toThrow();
  });
});
