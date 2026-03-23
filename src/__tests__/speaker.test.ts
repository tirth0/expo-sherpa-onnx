/// <reference types="jest" />
import { createSpeakerEmbeddingExtractor, createSpeakerEmbeddingManager } from '../speaker';

describe('Speaker Embedding Extractor', () => {
  it('creates an extractor with a valid handle', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    expect(extractor.handle).toBeGreaterThan(0);
    await extractor.destroy();
  });

  it('dim returns a positive integer', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    const dim = await extractor.dim();
    expect(dim).toBeGreaterThan(0);
    await extractor.destroy();
  });

  it('createStream returns a stream with a valid handle', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    const stream = await extractor.createStream();
    expect(stream.streamHandle).toBeGreaterThan(0);
    await stream.destroy();
    await extractor.destroy();
  });

  it('acceptWaveform does not throw', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    const stream = await extractor.createStream();
    await expect(
      stream.acceptWaveform([0.1, 0.2, 0.3, -0.1, 0.0])
    ).resolves.not.toThrow();
    await stream.destroy();
    await extractor.destroy();
  });

  it('isReady returns a boolean', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    const stream = await extractor.createStream();
    await stream.acceptWaveform([0.1, 0.2, 0.3]);
    const ready = await stream.isReady();
    expect(typeof ready).toBe('boolean');
    await stream.destroy();
    await extractor.destroy();
  });

  it('compute returns an embedding array', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    const stream = await extractor.createStream();
    await stream.acceptWaveform([0.1, 0.2, 0.3]);
    const embedding = await stream.compute();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    await stream.destroy();
    await extractor.destroy();
  });

  it('throws after extractor destroy', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    await extractor.destroy();
    await expect(extractor.dim()).rejects.toThrow('destroyed');
    await expect(extractor.createStream()).rejects.toThrow('destroyed');
  });

  it('throws after stream destroy', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    const stream = await extractor.createStream();
    await stream.destroy();
    await expect(stream.acceptWaveform([0.1])).rejects.toThrow('destroyed');
    await expect(stream.compute()).rejects.toThrow('destroyed');
    await extractor.destroy();
  });

  it('double destroy is safe', async () => {
    const extractor = await createSpeakerEmbeddingExtractor({
      model: '/mock/speaker_model.onnx',
    });
    await extractor.destroy();
    await expect(extractor.destroy()).resolves.not.toThrow();
  });
});

describe('Speaker Embedding Manager', () => {
  it('creates a manager with a valid handle', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    expect(manager.handle).toBeGreaterThan(0);
    await manager.destroy();
  });

  it('add and contains work correctly', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    const embedding = new Array(192).fill(0.1);
    const added = await manager.add('alice', embedding);
    expect(added).toBe(true);
    const contains = await manager.contains('alice');
    expect(contains).toBe(true);
    const notContains = await manager.contains('bob');
    expect(notContains).toBe(false);
    await manager.destroy();
  });

  it('numSpeakers returns correct count', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    expect(await manager.numSpeakers()).toBe(0);
    await manager.add('alice', new Array(192).fill(0.1));
    expect(await manager.numSpeakers()).toBe(1);
    await manager.add('bob', new Array(192).fill(0.2));
    expect(await manager.numSpeakers()).toBe(2);
    await manager.destroy();
  });

  it('allSpeakerNames returns enrolled names', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    await manager.add('alice', new Array(192).fill(0.1));
    await manager.add('bob', new Array(192).fill(0.2));
    const names = await manager.allSpeakerNames();
    expect(names).toContain('alice');
    expect(names).toContain('bob');
    await manager.destroy();
  });

  it('remove decreases speaker count', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    await manager.add('alice', new Array(192).fill(0.1));
    await manager.add('bob', new Array(192).fill(0.2));
    expect(await manager.numSpeakers()).toBe(2);
    await manager.remove('alice');
    expect(await manager.numSpeakers()).toBe(1);
    expect(await manager.contains('alice')).toBe(false);
    await manager.destroy();
  });

  it('search returns a string', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    await manager.add('alice', new Array(192).fill(0.1));
    const result = await manager.search(new Array(192).fill(0.1), 0.5);
    expect(typeof result).toBe('string');
    await manager.destroy();
  });

  it('verify returns a boolean', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    await manager.add('alice', new Array(192).fill(0.1));
    const result = await manager.verify('alice', new Array(192).fill(0.1), 0.5);
    expect(typeof result).toBe('boolean');
    await manager.destroy();
  });

  it('throws after destroy', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    await manager.destroy();
    await expect(manager.add('alice', [])).rejects.toThrow('destroyed');
    await expect(manager.numSpeakers()).rejects.toThrow('destroyed');
  });

  it('double destroy is safe', async () => {
    const manager = await createSpeakerEmbeddingManager(192);
    await manager.destroy();
    await expect(manager.destroy()).resolves.not.toThrow();
  });
});
