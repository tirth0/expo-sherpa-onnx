/// <reference types="jest" />
import {
  assetModelPath,
  fileModelPath,
  autoModelPath,
  resolveModelPath,
  listModelsAtPath,
} from '../utils';

describe('Model path factory functions', () => {
  it('assetModelPath creates asset config', () => {
    const config = assetModelPath('whisper-tiny');
    expect(config).toEqual({ type: 'asset', path: 'whisper-tiny' });
  });

  it('fileModelPath creates file config', () => {
    const config = fileModelPath('/data/local/models/whisper');
    expect(config).toEqual({ type: 'file', path: '/data/local/models/whisper' });
  });

  it('autoModelPath creates auto config', () => {
    const config = autoModelPath('sherpa-onnx-whisper');
    expect(config).toEqual({ type: 'auto', path: 'sherpa-onnx-whisper' });
  });

  it('factory functions preserve path exactly', () => {
    const path = 'path/with spaces/and-dashes';
    expect(assetModelPath(path).path).toBe(path);
    expect(fileModelPath(path).path).toBe(path);
    expect(autoModelPath(path).path).toBe(path);
  });
});

describe('resolveModelPath', () => {
  it('delegates to native module and returns a string', async () => {
    const result = await resolveModelPath({ type: 'asset', path: 'test-model' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns the path directly for file type', async () => {
    const result = await resolveModelPath({ type: 'file', path: '/absolute/path' });
    expect(result).toBe('/absolute/path');
  });
});

describe('listModelsAtPath', () => {
  it('returns an array of strings', async () => {
    const result = await listModelsAtPath('/some/path');
    expect(Array.isArray(result)).toBe(true);
    result.forEach((item) => {
      expect(typeof item).toBe('string');
    });
  });

  it('defaults recursive to false', async () => {
    const result = await listModelsAtPath('/some/path');
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts recursive parameter', async () => {
    const result = await listModelsAtPath('/some/path', true);
    expect(Array.isArray(result)).toBe(true);
  });
});
