/// <reference types="jest" />
import { createKeywordSpotter } from '../kws';

describe('Keyword Spotting (createKeywordSpotter)', () => {
  it('creates a spotter with a valid handle', async () => {
    const spotter = await createKeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: '/mock/encoder.onnx',
          decoder: '/mock/decoder.onnx',
          joiner: '/mock/joiner.onnx',
        },
        tokens: '/mock/tokens.txt',
      },
      keywordsFile: '/mock/keywords.txt',
    });
    expect(spotter.handle).toBeGreaterThan(0);
    await spotter.destroy();
  });

  it('createStream returns a stream with a valid handle', async () => {
    const spotter = await createKeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: '/mock/encoder.onnx',
          decoder: '/mock/decoder.onnx',
          joiner: '/mock/joiner.onnx',
        },
        tokens: '/mock/tokens.txt',
      },
    });
    const stream = await spotter.createStream();
    expect(stream.streamHandle).toBeGreaterThan(0);
    await stream.destroy();
    await spotter.destroy();
  });

  it('stream acceptWaveform does not throw', async () => {
    const spotter = await createKeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: '/mock/encoder.onnx',
          decoder: '/mock/decoder.onnx',
          joiner: '/mock/joiner.onnx',
        },
        tokens: '/mock/tokens.txt',
      },
    });
    const stream = await spotter.createStream();
    await expect(
      stream.acceptWaveform([0.0, 0.1, -0.1], 16000)
    ).resolves.not.toThrow();
    await stream.destroy();
    await spotter.destroy();
  });

  it('getResult returns a KeywordSpotterResult shape', async () => {
    const spotter = await createKeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: '/mock/encoder.onnx',
          decoder: '/mock/decoder.onnx',
          joiner: '/mock/joiner.onnx',
        },
        tokens: '/mock/tokens.txt',
      },
    });
    const stream = await spotter.createStream();
    const result = await stream.getResult();
    expect(typeof result.keyword).toBe('string');
    expect(Array.isArray(result.tokens)).toBe(true);
    expect(Array.isArray(result.timestamps)).toBe(true);
    await stream.destroy();
    await spotter.destroy();
  });

  it('throws after spotter destroy', async () => {
    const spotter = await createKeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: '/mock/encoder.onnx',
          decoder: '/mock/decoder.onnx',
          joiner: '/mock/joiner.onnx',
        },
        tokens: '/mock/tokens.txt',
      },
    });
    await spotter.destroy();
    await expect(spotter.createStream()).rejects.toThrow('destroyed');
  });

  it('throws after stream destroy', async () => {
    const spotter = await createKeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: '/mock/encoder.onnx',
          decoder: '/mock/decoder.onnx',
          joiner: '/mock/joiner.onnx',
        },
        tokens: '/mock/tokens.txt',
      },
    });
    const stream = await spotter.createStream();
    await stream.destroy();
    await expect(stream.acceptWaveform([0.1])).rejects.toThrow('destroyed');
    await expect(stream.getResult()).rejects.toThrow('destroyed');
    await spotter.destroy();
  });

  it('double destroy is safe', async () => {
    const spotter = await createKeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: '/mock/encoder.onnx',
          decoder: '/mock/decoder.onnx',
          joiner: '/mock/joiner.onnx',
        },
        tokens: '/mock/tokens.txt',
      },
    });
    await spotter.destroy();
    await expect(spotter.destroy()).resolves.not.toThrow();
  });
});
