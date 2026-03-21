/// <reference types="jest" />
import { createTTS } from '../tts';

describe('Offline TTS (createTTS)', () => {
  it('creates an engine with a valid handle and metadata', async () => {
    const engine = await createTTS({
      model: {
        vits: {
          model: '/mock/model.onnx',
          tokens: '/mock/tokens.txt',
        },
        numThreads: 2,
      },
    });
    expect(engine.handle).toBeGreaterThan(0);
    expect(typeof engine.sampleRate).toBe('number');
    expect(typeof engine.numSpeakers).toBe('number');
    await engine.destroy();
  });

  it('generate returns audio with samples and sampleRate', async () => {
    const engine = await createTTS({
      model: {
        vits: {
          model: '/mock/model.onnx',
          tokens: '/mock/tokens.txt',
        },
      },
    });
    const audio = await engine.generate('Hello world');
    expect(audio).toBeDefined();
    expect(Array.isArray(audio.samples)).toBe(true);
    expect(audio.samples.length).toBeGreaterThan(0);
    expect(typeof audio.sampleRate).toBe('number');
    expect(audio.sampleRate).toBeGreaterThan(0);
    await engine.destroy();
  });

  it('generate respects sid and speed parameters', async () => {
    const engine = await createTTS({
      model: {
        vits: {
          model: '/mock/model.onnx',
          tokens: '/mock/tokens.txt',
        },
      },
    });
    const audio = await engine.generate('Test speech', 1, 1.5);
    expect(audio).toBeDefined();
    expect(Array.isArray(audio.samples)).toBe(true);
    await engine.destroy();
  });

  it('throws after destroy', async () => {
    const engine = await createTTS({
      model: {
        vits: {
          model: '/mock/model.onnx',
          tokens: '/mock/tokens.txt',
        },
      },
    });
    await engine.destroy();
    await expect(engine.generate('Hello')).rejects.toThrow('destroyed');
  });

  it('double destroy is safe', async () => {
    const engine = await createTTS({
      model: {
        vits: {
          model: '/mock/model.onnx',
          tokens: '/mock/tokens.txt',
        },
      },
    });
    await engine.destroy();
    await expect(engine.destroy()).resolves.toBeUndefined();
  });

  it('generateStreaming throws after destroy', async () => {
    const engine = await createTTS({
      model: {
        vits: {
          model: '/mock/model.onnx',
          tokens: '/mock/tokens.txt',
        },
      },
    });
    await engine.destroy();
    await expect(
      engine.generateStreaming('Hello', {
        onChunk: () => { },
      })
    ).rejects.toThrow('destroyed');
  });
});
