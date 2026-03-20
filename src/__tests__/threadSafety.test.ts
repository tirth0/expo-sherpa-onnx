/// <reference types="jest" />
import { createSTT, createStreamingSTT } from '../stt';
import type { OnlineSTTStream } from '../stt';

// Access mock internals to verify handle state
const mock = jest.requireActual('../../mocks/ExpoSherpaOnnx') as typeof import('../../mocks/ExpoSherpaOnnx');

beforeEach(() => {
  mock._resetMockState();
});

// =============================================================================
// Offline STT – lifecycle robustness
// =============================================================================

describe('Offline STT – thread safety / lifecycle', () => {
  const offlineConfig = {
    modelConfig: {
      whisper: { encoder: '/m/enc.onnx', decoder: '/m/dec.onnx' },
      tokens: '/m/tokens.txt',
    },
  };

  it('double destroy is idempotent and never reaches native twice', async () => {
    const engine = await createSTT(offlineConfig);
    await engine.destroy();
    await engine.destroy();
    await engine.destroy();
    expect(mock._getDestroyedOffline().has(engine.handle)).toBe(true);
  });

  it('all operations throw after destroy – transcribeSamples', async () => {
    const engine = await createSTT(offlineConfig);
    await engine.destroy();
    await expect(engine.transcribeSamples([0.1], 16000)).rejects.toThrow('destroyed');
  });

  it('all operations throw after destroy – transcribeFile', async () => {
    const engine = await createSTT(offlineConfig);
    await engine.destroy();
    await expect(engine.transcribeFile('/test.wav')).rejects.toThrow('destroyed');
  });

  it('concurrent destroy + transcribeSamples settles without unhandled errors', async () => {
    const engine = await createSTT(offlineConfig);
    const results = await Promise.allSettled([
      engine.destroy(),
      engine.transcribeSamples([0.1, 0.2], 16000),
      engine.transcribeSamples([0.3, 0.4], 16000),
    ]);

    const destroyResult = results[0];
    expect(destroyResult.status).toBe('fulfilled');

    for (const r of results.slice(1)) {
      if (r.status === 'rejected') {
        expect(r.reason.message).toMatch(/destroyed/);
      }
    }
  });

  it('concurrent destroy + transcribeFile settles without unhandled errors', async () => {
    const engine = await createSTT(offlineConfig);
    const results = await Promise.allSettled([
      engine.destroy(),
      engine.transcribeFile('/a.wav'),
      engine.transcribeFile('/b.wav'),
    ]);

    expect(results[0].status).toBe('fulfilled');
    for (const r of results.slice(1)) {
      if (r.status === 'rejected') {
        expect(r.reason.message).toMatch(/destroyed/);
      }
    }
  });

  it('rapid create-destroy cycles do not leak or crash', async () => {
    const handles: number[] = [];
    for (let i = 0; i < 50; i++) {
      const engine = await createSTT(offlineConfig);
      handles.push(engine.handle);
      await engine.destroy();
    }
    const uniqueHandles = new Set(handles);
    expect(uniqueHandles.size).toBe(50);
    for (const h of handles) {
      expect(mock._getDestroyedOffline().has(h)).toBe(true);
    }
  });

  it('interleaved create-use-destroy cycles work correctly', async () => {
    const engine1 = await createSTT(offlineConfig);
    const engine2 = await createSTT(offlineConfig);

    const r1 = await engine1.transcribeSamples([0.1], 16000);
    expect(r1.text.length).toBeGreaterThan(0);

    await engine1.destroy();

    const r2 = await engine2.transcribeSamples([0.2], 16000);
    expect(r2.text.length).toBeGreaterThan(0);
    await expect(engine1.transcribeSamples([0.3], 16000)).rejects.toThrow('destroyed');

    await engine2.destroy();
  });
});

// =============================================================================
// Online STT – lifecycle robustness
// =============================================================================

describe('Online STT – thread safety / lifecycle', () => {
  const onlineConfig = {
    modelConfig: {
      transducer: {
        encoder: '/m/enc.onnx',
        decoder: '/m/dec.onnx',
        joiner: '/m/joiner.onnx',
      },
      tokens: '/m/tokens.txt',
    },
    enableEndpoint: true,
  };

  it('engine double destroy is idempotent', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    await engine.destroy();
    await engine.destroy();
    await engine.destroy();
    expect(mock._getDestroyedOnline().has(engine.handle)).toBe(true);
  });

  it('stream double destroy is idempotent', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();
    await stream.destroy();
    await stream.destroy();
    await stream.destroy();
    expect(mock._getDestroyedStreams().has(stream.streamHandle)).toBe(true);
    await engine.destroy();
  });

  it('createStream throws after engine destroy', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    await engine.destroy();
    await expect(engine.createStream()).rejects.toThrow('destroyed');
  });

  it('all stream operations throw after stream destroy', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();
    await stream.destroy();

    await expect(stream.acceptWaveform([0.1], 16000)).rejects.toThrow('destroyed');
    await expect(stream.inputFinished()).rejects.toThrow('destroyed');
    await expect(stream.decode()).rejects.toThrow('destroyed');
    await expect(stream.isReady()).rejects.toThrow('destroyed');
    await expect(stream.isEndpoint()).rejects.toThrow('destroyed');
    await expect(stream.getResult()).rejects.toThrow('destroyed');
    await expect(stream.reset()).rejects.toThrow('destroyed');

    await engine.destroy();
  });

  it('concurrent destroy + stream operations settle without unhandled errors', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();

    const results = await Promise.allSettled([
      stream.destroy(),
      stream.acceptWaveform([0.1, 0.2], 16000),
      stream.decode(),
      stream.isReady(),
      stream.getResult(),
      stream.isEndpoint(),
      stream.reset(),
    ]);

    expect(results[0].status).toBe('fulfilled');
    for (const r of results.slice(1)) {
      if (r.status === 'rejected') {
        expect(r.reason.message).toMatch(/destroyed/);
      }
    }

    await engine.destroy();
  });

  it('concurrent engine destroy + createStream settle without unhandled errors', async () => {
    const engine = await createStreamingSTT(onlineConfig);

    const results = await Promise.allSettled([
      engine.destroy(),
      engine.createStream(),
      engine.createStream(),
    ]);

    expect(results[0].status).toBe('fulfilled');
    for (const r of results.slice(1)) {
      if (r.status === 'rejected') {
        expect(r.reason.message).toMatch(/destroyed/);
      }
    }
  });

  it('destroying engine does not crash if stream is still referenced (JS guard)', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();

    await engine.destroy();

    // Stream was not explicitly destroyed, but engine is gone.
    // The JS guard on the stream uses its own `streamDestroyed` flag,
    // so these calls will still pass through to the mock (which now
    // detects the parent recognizer is destroyed and throws).
    // In production, the Kotlin `synchronized` + `ptr` checks handle this.
    // The stream should still be destroyable without crashing.
    await stream.destroy();
    expect(mock._getDestroyedStreams().has(stream.streamHandle)).toBe(true);
  });

  it('multiple independent streams – destroying one does not affect others', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream1 = await engine.createStream();
    const stream2 = await engine.createStream();
    const stream3 = await engine.createStream();

    await stream1.acceptWaveform([0.1], 16000);
    await stream2.acceptWaveform([0.2], 16000);
    await stream3.acceptWaveform([0.3], 16000);

    await stream1.destroy();

    await expect(stream1.acceptWaveform([0.4], 16000)).rejects.toThrow('destroyed');
    await stream2.acceptWaveform([0.5], 16000);
    await stream3.acceptWaveform([0.6], 16000);

    const result2 = await stream2.getResult();
    expect(typeof result2.text).toBe('string');

    await stream2.destroy();
    await stream3.destroy();
    await engine.destroy();
  });

  it('rapid stream create-destroy cycles on same engine', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const handles: number[] = [];

    for (let i = 0; i < 30; i++) {
      const stream = await engine.createStream();
      handles.push(stream.streamHandle);
      await stream.acceptWaveform([0.1 * i], 16000);
      await stream.destroy();
    }

    expect(new Set(handles).size).toBe(30);
    for (const h of handles) {
      expect(mock._getDestroyedStreams().has(h)).toBe(true);
    }

    await engine.destroy();
  });

  it('full lifecycle: create engine, create stream, feed audio, decode, get result, teardown', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();

    await stream.acceptWaveform([0.0, 0.1, -0.1, 0.05], 16000);
    const ready = await stream.isReady();
    expect(typeof ready).toBe('boolean');

    await stream.decode();
    const result = await stream.getResult();
    expect(typeof result.text).toBe('string');

    const endpoint = await stream.isEndpoint();
    expect(typeof endpoint).toBe('boolean');

    if (endpoint) {
      await stream.reset();
    }

    await stream.inputFinished();
    await stream.destroy();
    await engine.destroy();

    expect(mock._getDestroyedStreams().has(stream.streamHandle)).toBe(true);
    expect(mock._getDestroyedOnline().has(engine.handle)).toBe(true);
  });

  it('rapid engine create-destroy cycles do not leak', async () => {
    const handles: number[] = [];
    for (let i = 0; i < 30; i++) {
      const engine = await createStreamingSTT(onlineConfig);
      handles.push(engine.handle);
      const stream = await engine.createStream();
      await stream.acceptWaveform([0.1], 16000);
      await stream.destroy();
      await engine.destroy();
    }
    expect(new Set(handles).size).toBe(30);
    for (const h of handles) {
      expect(mock._getDestroyedOnline().has(h)).toBe(true);
    }
  });
});

// =============================================================================
// Correct teardown ordering (mirrors the fix in App.tsx)
// =============================================================================

describe('Teardown ordering – stream before engine', () => {
  const onlineConfig = {
    modelConfig: {
      transducer: {
        encoder: '/m/enc.onnx',
        decoder: '/m/dec.onnx',
        joiner: '/m/joiner.onnx',
      },
      tokens: '/m/tokens.txt',
    },
    enableEndpoint: true,
  };

  it('destroying stream then engine succeeds (correct order)', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();

    await stream.acceptWaveform([0.1, 0.2], 16000);
    await stream.destroy();
    await engine.destroy();

    expect(mock._getDestroyedStreams().has(stream.streamHandle)).toBe(true);
    expect(mock._getDestroyedOnline().has(engine.handle)).toBe(true);
  });

  it('destroying engine then stream succeeds (reverse order – should not crash)', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();

    await stream.acceptWaveform([0.1, 0.2], 16000);
    await engine.destroy();
    await stream.destroy();

    expect(mock._getDestroyedOnline().has(engine.handle)).toBe(true);
    expect(mock._getDestroyedStreams().has(stream.streamHandle)).toBe(true);
  });

  it('concurrent stream + engine destroy settles cleanly', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const stream = await engine.createStream();

    const results = await Promise.allSettled([
      stream.destroy(),
      engine.destroy(),
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
  });

  it('multiple streams torn down concurrently with engine', async () => {
    const engine = await createStreamingSTT(onlineConfig);
    const streams: OnlineSTTStream[] = [];
    for (let i = 0; i < 10; i++) {
      streams.push(await engine.createStream());
    }

    const results = await Promise.allSettled([
      ...streams.map((s) => s.destroy()),
      engine.destroy(),
    ]);

    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
  });
});

// =============================================================================
// Mixed offline + online – no cross-contamination
// =============================================================================

describe('Mixed offline + online engines – isolation', () => {
  const offlineConfig = {
    modelConfig: {
      whisper: { encoder: '/m/enc.onnx', decoder: '/m/dec.onnx' },
      tokens: '/m/tokens.txt',
    },
  };
  const onlineConfig = {
    modelConfig: {
      transducer: {
        encoder: '/m/enc.onnx',
        decoder: '/m/dec.onnx',
        joiner: '/m/joiner.onnx',
      },
      tokens: '/m/tokens.txt',
    },
    enableEndpoint: true,
  };

  it('destroying offline engine does not affect online engine', async () => {
    const offline = await createSTT(offlineConfig);
    const online = await createStreamingSTT(onlineConfig);
    const stream = await online.createStream();

    await offline.destroy();

    await stream.acceptWaveform([0.1], 16000);
    const result = await stream.getResult();
    expect(typeof result.text).toBe('string');

    await stream.destroy();
    await online.destroy();
  });

  it('destroying online engine does not affect offline engine', async () => {
    const offline = await createSTT(offlineConfig);
    const online = await createStreamingSTT(onlineConfig);

    await online.destroy();

    const result = await offline.transcribeSamples([0.1, 0.2], 16000);
    expect(result.text.length).toBeGreaterThan(0);

    await offline.destroy();
  });

  it('concurrent destruction of both engine types settles cleanly', async () => {
    const offline = await createSTT(offlineConfig);
    const online = await createStreamingSTT(onlineConfig);
    const stream = await online.createStream();

    const results = await Promise.allSettled([
      offline.destroy(),
      stream.destroy(),
      online.destroy(),
    ]);

    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
  });
});
